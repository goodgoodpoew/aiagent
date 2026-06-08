import { ProviderCapabilityService } from './provider-capability.service';

describe('ProviderCapabilityService', () => {
  const service = new ProviderCapabilityService();

  it('从数组 features 归一化常见模型能力', () => {
    const capabilities = service.resolveModelCapabilities({
      providerName: 'openai',
      adapterType: 'openai-compatible',
      modelName: 'gpt-4o',
      modelType: 'llm',
      features: ['chat', 'stream', 'tools', 'reasoning-effort', 'json-mode'],
    });

    expect(capabilities).toEqual({
      chat: true,
      stream: true,
      toolCalling: { supported: true },
      reasoning: { supported: true, requestEffortParam: 'reasoning_effort' },
      vision: false,
      jsonMode: true,
    });
  });

  it('从对象 features 读取显式能力开关', () => {
    const capabilities = service.resolveModelCapabilities({
      providerName: 'custom',
      adapterType: 'openai-compatible',
      modelName: 'custom-model',
      modelType: 'llm',
      features: {
        chat: true,
        stream: false,
        toolCalling: true,
        reasoning: { supported: false },
        vision: true,
      },
    });

    expect(capabilities).toMatchObject({
      chat: true,
      stream: false,
      toolCalling: { supported: true },
      reasoning: { supported: false },
      vision: true,
      jsonMode: false,
    });
  });

  it('未知 LLM 默认只声明基础聊天和流式能力', () => {
    const capabilities = service.resolveModelCapabilities({
      providerName: 'unknown',
      adapterType: 'openai-compatible',
      modelName: 'unknown-chat',
      modelType: 'llm',
      features: null,
    });

    expect(capabilities).toEqual({
      chat: true,
      stream: true,
      toolCalling: { supported: false },
      reasoning: { supported: false },
      vision: false,
      jsonMode: false,
    });
  });

  it('非 LLM 默认不声明聊天和流式能力', () => {
    const capabilities = service.resolveModelCapabilities({
      providerName: 'openai',
      adapterType: 'openai-compatible',
      modelName: 'text-embedding-3-small',
      modelType: 'text-embedding',
      features: null,
    });

    expect(capabilities.chat).toBe(false);
    expect(capabilities.stream).toBe(false);
    expect(capabilities.toolCalling.supported).toBe(false);
  });
});
