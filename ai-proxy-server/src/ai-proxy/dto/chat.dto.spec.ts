import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChatRequestDto } from './chat.dto';

function validateDto(payload: unknown) {
  return validateSync(plainToInstance(ChatRequestDto, payload), {
    whitelist: true,
  });
}

const validPayload = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: '你好' }],
};

describe('ChatRequestDto', () => {
  it('接受合法的非流式聊天请求', () => {
    expect(validateDto(validPayload)).toHaveLength(0);
  });

  it('拒绝空 messages', () => {
    const errors = validateDto({ ...validPayload, messages: [] });

    expect(JSON.stringify(errors)).toContain('arrayMinSize');
  });

  it('拒绝非法消息 role', () => {
    const errors = validateDto({
      ...validPayload,
      messages: [{ role: 'owner', content: '越权角色' }],
    });

    expect(JSON.stringify(errors)).toContain('isIn');
  });

  it('拒绝超过附件数量限制的 fileIds', () => {
    const errors = validateDto({
      ...validPayload,
      fileIds: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'],
    });

    expect(JSON.stringify(errors)).toContain('arrayMaxSize');
  });

  it('拒绝引用未启用工具的 toolChoice', () => {
    const errors = validateDto({
      ...validPayload,
      tools: [
        {
          source: 'builtin',
          name: 'location_acquisition',
          description: '',
          inputSchema: {},
          enabled: true,
        },
      ],
      toolChoice: { type: 'tool', name: 'file_read' },
    });

    expect(JSON.stringify(errors)).toContain('toolChoice');
  });
});
