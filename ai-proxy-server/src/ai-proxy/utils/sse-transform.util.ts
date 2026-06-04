import { IncomingMessage } from 'http';
import { Response } from 'express';
import { Logger } from '@nestjs/common';
import { sanitizeStreamError, StreamErrorCode } from '../errors/stream-error.util';

const logger = new Logger('SseTransform');

export interface PipCallBack {
  onStart?: () => void;
  onComplete?: (finalContent: string) => void | Promise<void>;
  onError?: (error: Error) => void;
}

/** v1 legacy 客户端 chunk，保留 OpenAI-like choices 以兼容旧示例页。 */
export interface ClientStreamChunk {
  status?: string;
  errorCode?: string;
  sessionId?: string;
  messageId?: string;
  delta?: string;
  role?: string;
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    sessionId: string;
  }>;
}

export function writeSseEvent(res: Response, eventName: string, payload: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
}

/** 向前端写入与正常流一致的 SSE 错误块（含 [DONE]） */
export function writeClientStreamError(
  res: Response,
  sessionId: string,
  errorMessage: string,
  errorCode?: StreamErrorCode | string,
): void {
  if (res.writableEnded) return;

  const payload: ClientStreamChunk = {
    status: 'error',
    ...(errorCode ? { errorCode } : {}),
    choices: [
      {
        message: {
          content: errorMessage,
          role: 'assistant',
        },
        sessionId,
      },
    ],
  };
  writeSseEvent(res, 'error', {
    code: errorCode ?? 'STREAM_ERROR',
    message: errorMessage,
    retryable: true,
    ...payload,
  });
  res.write('event: done\ndata: [DONE]\n\n');
  res.end();
}

/**
 * v1 legacy SSE 转换器。
 * 该函数把 OpenAI-compatible delta 投影成 choices 结构，只允许旧端点复用；
 * v2 主链路应通过 streaming adapter + StreamEventWriter 输出 message.part.*。
 */
export function pipeOpenAiStreamToClient(
  upstream: IncomingMessage,
  res: Response,
  sessionId: string,
  assistantMessageId: string,
  callback?: PipCallBack,
) {
  let buffer = '';
  /** 仅用于 onComplete 落库，不下发给客户端 */
  let finalString = '';
  const { onStart, onComplete, onError } = callback ?? {};

  // 通知流开始
  onStart?.();

  upstream.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;

      const data = dataLine.slice(6).trim();
      if (data === '[DONE]') {
        res.write('event: done\ndata: [DONE]\n\n');
        continue;
      }

      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        const deltaContent = choice?.delta?.content;
        const messageContent = choice?.message?.content;

        let deltaForClient: string;
        if (deltaContent) {
          finalString += deltaContent;
          deltaForClient = deltaContent;
        } else if (messageContent) {
          finalString = messageContent;
          deltaForClient = messageContent;
        } else {
          continue;
        }

        const payload: ClientStreamChunk = {
          sessionId,
          messageId: assistantMessageId,
          delta: deltaForClient,
          role: choice?.delta?.role ?? choice?.message?.role ?? 'assistant',
          choices: [
            {
              message: {
                content: deltaForClient,
                role: choice?.delta?.role ?? choice?.message?.role ?? 'assistant',
              },
              sessionId,
            },
          ],
        };
        writeSseEvent(res, 'message.delta', payload);
        logger.debug(`chunk delta length: ${deltaForClient.length}`);
      } catch {
        // skip incomplete JSON
      }
    }
  });

  upstream.on('end', () => {
    res.write('event: done\ndata: [DONE]\n\n');
    res.end();

    // 流完成回调：传递累积的完整内容
    if (onComplete) {
      Promise.resolve(onComplete(finalString)).catch((err) => {
        logger.error(`onComplete 回调失败: ${err.message}`);
      });
    }
  });

  upstream.on('error', (err: Error) => {
    const sanitized = sanitizeStreamError(err);
    logger.error(`upstream error: ${sanitized.logDetail}`);

    if (onError) {
      onError(err);
    }

    if (!res.writableEnded) {
      writeClientStreamError(res, sessionId, sanitized.userMessage, sanitized.code);
    }
  });
}
