import XMarkdown from '@ant-design/x-markdown';
import { Alert, Collapse, Space, Tag, Typography } from 'antd';
import type { FC } from 'react';
import { getMessageTextProjection } from '@/store/adapters/messageAdapter';
import type { ChatMessage } from '@/store/types';

interface MessagePartsRendererProps {
  message: ChatMessage;
}

function stringifyPreview(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const MessagePartsRenderer: FC<MessagePartsRendererProps> = ({ message }) => {
  const parts = message.parts ?? [];

  if (!parts.length) {
    return <XMarkdown>{getMessageTextProjection(message)}</XMarkdown>;
  }

  // 后端 v2 协议把 assistant 输出拆成多个 part：
  // text 是最终回答，reasoning/tool/file_read/error 是辅助过程，各自用不同组件渲染以免混在正文里。
  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      {parts.map((part) => {
        if (part.type === 'text') {
          return <XMarkdown key={part.id}>{part.text}</XMarkdown>;
        }

        if (part.type === 'reasoning') {
          const title = part.status === 'streaming' ? '思考中' : '思考完成';

          if (part.visibility === 'hidden') {
            return part.status === 'streaming'
              ? (
                <Typography.Text key={part.id} type="secondary">
                  {title}
                </Typography.Text>
              )
              : null;
          }

          const visibleText = part.visibility === 'full'
            ? part.text || part.summary
            : part.summary;
          const content = visibleText || (part.status === 'streaming' ? '正在整理思路...' : '已完成思考');

          // reasoning 与最终回答分开渲染，避免思考过程被误认为 assistant 正文。
          return (
            <Collapse
              key={part.id}
              size="small"
              ghost
              items={[
                {
                  key: part.id,
                  label: <Typography.Text type="secondary">{title}</Typography.Text>,
                  children: <XMarkdown>{content}</XMarkdown>,
                },
              ]}
            />
          );
        }

        if (part.type === 'error') {
          // error part 是 v2 失败态的唯一展示来源，避免 catch 和 stream.failed 重复拼接错误文案。
          return (
            <Alert
              key={part.id}
              type="error"
              showIcon
              message={part.message}
              description={part.code ? `错误码：${part.code}` : undefined}
            />
          );
        }

        if (part.type === 'tool_call') {
          const statusText = {
            partial: '参数生成中',
            ready: '等待执行',
            running: '执行中',
            done: '调用完成',
            failed: '调用失败',
          }[part.status];
          const argsPreview = part.arguments
            ? stringifyPreview(part.arguments)
            : part.argumentsText;

          // 工具调用与正文分开展示，避免模型生成的 JSON 参数被误认为 assistant 回答。
          return (
            <Collapse
              key={part.id}
              size="small"
              ghost
              items={[
                {
                  key: part.id,
                  label: (
                    <Space size={6}>
                      <Tag color={part.status === 'failed' ? 'error' : 'processing'}>{statusText}</Tag>
                      <Typography.Text type="secondary">{part.toolName}</Typography.Text>
                    </Space>
                  ),
                  children: argsPreview
                    ? <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{argsPreview}</Typography.Paragraph>
                    : <Typography.Text type="secondary">等待工具参数...</Typography.Text>,
                },
              ]}
            />
          );
        }

        if (part.type === 'tool_result') {
          const hasError = part.status === 'failed' || Boolean(part.error);
          const content = hasError
            ? part.error?.message ?? '工具执行失败'
            : stringifyPreview(part.result) || '工具执行完成';

          return (
            <Alert
              key={part.id}
              type={hasError ? 'warning' : 'success'}
              showIcon
              message={`${part.toolName} ${part.status === 'streaming' ? '执行中' : '执行结果'}`}
              description={<Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{content}</Typography.Paragraph>}
            />
          );
        }

        if (part.type === 'file_read') {
          // file_read part 展示后端读取附件的过程和结果，帮助用户理解附件是否进入了模型上下文。
          const statusText = part.status === 'streaming'
            ? '正在读取附件'
            : part.status === 'failed'
              ? '未读取附件'
              : '已读取附件';
          const description = part.status === 'failed'
            ? part.reason ?? '文件未进入本轮模型上下文'
            : part.tokenEstimate !== undefined
              ? `约 ${part.tokenEstimate} tokens`
              : undefined;

          return (
            <Alert
              key={part.id}
              type={part.status === 'failed' ? 'warning' : part.status === 'streaming' ? 'info' : 'success'}
              showIcon
              message={`${statusText}：${part.name}`}
              description={description}
            />
          );
        }

        if (part.type === 'file') {
          return <Tag key={part.id}>{part.name}</Tag>;
        }

        if (part.type === 'reference') {
          return (
            <Typography.Text key={part.id} type="secondary">
              {part.title}
            </Typography.Text>
          );
        }

        return null;
      })}
    </Space>
  );
};

export default MessagePartsRenderer;
