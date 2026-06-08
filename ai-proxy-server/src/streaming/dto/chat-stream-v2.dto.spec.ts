import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChatStreamRequestV2 } from './chat-stream-v2.dto';

function validateDto(payload: unknown) {
  return validateSync(plainToInstance(ChatStreamRequestV2, payload), {
    whitelist: true,
  });
}

const validPayload = {
  protocol: 'aiagent.stream.v2',
  requestId: 'req_1',
  clientMessageId: 'client_1',
  input: {
    role: 'user',
    parts: [{ type: 'text', text: '你好' }],
  },
};

describe('ChatStreamRequestV2 DTO', () => {
  it('接受合法的 v2 流式请求', () => {
    expect(validateDto(validPayload)).toHaveLength(0);
  });

  it('拒绝空 input.parts', () => {
    const errors = validateDto({
      ...validPayload,
      input: { role: 'user', parts: [] },
    });

    expect(JSON.stringify(errors)).toContain('arrayMinSize');
  });

  it('拒绝非法 role', () => {
    const errors = validateDto({
      ...validPayload,
      input: { role: 'assistant', parts: [{ type: 'text', text: '你好' }] },
    });

    expect(JSON.stringify(errors)).toContain('isIn');
  });

  it('拒绝超过附件数量限制的 context.fileIds', () => {
    const errors = validateDto({
      ...validPayload,
      context: { fileIds: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] },
    });

    expect(JSON.stringify(errors)).toContain('arrayMaxSize');
  });

  it('拒绝引用未启用工具的 toolChoice', () => {
    const errors = validateDto({
      ...validPayload,
      runtime: {
        tools: [{ source: 'builtin', name: 'location_acquisition' }],
        toolChoice: { type: 'tool', name: 'file_read' },
      },
    });

    expect(JSON.stringify(errors)).toContain('toolChoice');
  });

  it('接受引用 runtime.tools 中工具的 toolChoice', () => {
    const errors = validateDto({
      ...validPayload,
      runtime: {
        tools: [{ source: 'builtin', name: 'location_acquisition' }],
        toolChoice: { type: 'tool', name: 'location_acquisition' },
      },
    });

    expect(errors).toHaveLength(0);
  });
});
