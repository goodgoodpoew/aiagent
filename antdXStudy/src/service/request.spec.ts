import { describe, expect, it } from 'vitest';
import { ApiClientError, parseApiEnvelopeResponse } from './request';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
}

describe('parseApiEnvelopeResponse', () => {
  it('解析统一成功响应中的 data', async () => {
    const data = await parseApiEnvelopeResponse<{ id: string }>(
      jsonResponse({
        success: true,
        code: 'OK',
        message: '成功',
        data: { id: 'session-1' },
      }),
    );

    expect(data).toEqual({ id: 'session-1' });
  });

  it('把统一错误响应转换为 ApiClientError', async () => {
    await expect(
      parseApiEnvelopeResponse(
        jsonResponse(
          {
            success: false,
            code: 'MODEL_DISABLED',
            message: '模型已禁用',
            data: null,
            traceId: 'trace-1',
            error: { details: { provider: 'openai' } },
          },
          { status: 400 },
        ),
      ),
    ).rejects.toMatchObject<ApiClientError>({
      name: 'ApiClientError',
      code: 'MODEL_DISABLED',
      message: '模型已禁用',
      status: 400,
      traceId: 'trace-1',
      details: { provider: 'openai' },
    });
  });

  it('非统一错误响应使用兜底文案', async () => {
    await expect(
      parseApiEnvelopeResponse(
        jsonResponse({ message: '服务暂不可用' }, { status: 503 }),
        '请求失败',
      ),
    ).rejects.toMatchObject({
      code: 'HTTP_503',
      message: '服务暂不可用',
      status: 503,
    });
  });
});
