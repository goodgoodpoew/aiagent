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
}
