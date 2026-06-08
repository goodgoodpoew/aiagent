export const MODEL_TYPES = [
  'llm',
  'text-embedding',
  'rerank',
  'speech-to-text',
  'tts',
  'image',
] as const;

export type ModelType = (typeof MODEL_TYPES)[number];

export const ADAPTER_TYPES = ['openai-compatible', 'anthropic', 'gemini'] as const;

export type AdapterType = (typeof ADAPTER_TYPES)[number];

export const PROVIDER_TYPES = ['system', 'custom'] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export interface ReasoningRuntimeOptions {
  /** 是否启用推理 */
  enabled?: boolean;
  /** 推理能力等级 */
  effort?: 'low' | 'medium' | 'high';
  /** 推理结果显示方式 */
  display?: 'none' | 'summary' | 'full';
}

export interface ProviderReasoningCapability {
  supported: boolean;
  requestEffortParam?: 'reasoning_effort';
}

export interface ProviderToolCallingCapability {
  supported: boolean;
}

export interface ProviderModelCapabilities {
  chat: boolean;
  stream: boolean;
  toolCalling: ProviderToolCallingCapability;
  reasoning: ProviderReasoningCapability;
  vision: boolean;
  jsonMode: boolean;
}

export type ProviderModelFeatures = Record<string, unknown> | string[] | null | undefined;

export interface CredentialConfig {
  apiKey?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export interface ResolvedProviderCredential {
  id: string;
  name: string;
  config: CredentialConfig;
}

export interface ResolvedChatProvider {
  provider: string;
  providerDisplayName: string;
  model: string;
  credentialId?: string;
  baseUrl: string;
  apiKey: string;
  adapterType: AdapterType;
  capabilities?: ProviderModelCapabilities;
  reasoning?: ProviderReasoningCapability;
  toolCalling?: ProviderToolCallingCapability;
}
