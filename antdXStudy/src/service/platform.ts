import { request } from '@umijs/max';
import { getApiBaseUrl } from './config';

const providersUrl = () => `${getApiBaseUrl()}/model-providers`;

export type ModelType =
  | 'llm'
  | 'text-embedding'
  | 'rerank'
  | 'speech-to-text'
  | 'tts'
  | 'image';
export type AdapterType = 'openai-compatible' | 'anthropic' | 'gemini';
export type ProviderType = 'system' | 'custom';

export interface ProviderCredential {
  id: string;
  providerId: string;
  name: string;
  configured: boolean;
  maskedConfig: Record<string, unknown>;
  isDefault: boolean;
  enabled: boolean;
  lastValidatedAt?: string | null;
  lastValidationError?: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface ProviderModel {
  id: string;
  providerId: string;
  modelType: ModelType;
  name: string;
  displayName: string;
  features?: string[] | Record<string, unknown>;
  contextSize?: number | null;
  maxOutput?: number | null;
  defaultParameters?: Record<string, unknown> | null;
  pricing?: Record<string, unknown> | null;
  capabilities?: ProviderModelCapabilities;
  deprecated: boolean;
  isDefault: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelProvider {
  id: string;
  name: string;
  displayName: string;
  providerType: ProviderType;
  iconUrl?: string | null;
  baseUrl: string;
  adapterType: AdapterType;
  enabled: boolean;
  systemBuiltIn: boolean;
  configured: boolean;
  configSchema?: Record<string, unknown> | null;
  credentials: ProviderCredential[];
  modelStats: Partial<Record<ModelType, number>>;
  models?: ProviderModel[];
  modelsByType?: Partial<Record<ModelType, ProviderModel[]>>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProviderPayload {
  name: string;
  displayName: string;
  providerType?: ProviderType;
  iconUrl?: string;
  baseUrl: string;
  adapterType?: AdapterType;
  enabled?: boolean;
}

export interface UpdateProviderPayload {
  displayName?: string;
  providerType?: ProviderType;
  iconUrl?: string;
  baseUrl?: string;
  adapterType?: AdapterType;
  enabled?: boolean;
}

export interface CredentialPayload {
  name: string;
  config: Record<string, unknown>;
  isDefault?: boolean;
  enabled?: boolean;
}

export interface UpdateCredentialPayload {
  name?: string;
  config?: Record<string, unknown>;
  isDefault?: boolean;
  enabled?: boolean;
}

export interface ModelPayload {
  modelType?: ModelType;
  name: string;
  displayName: string;
  features?: string[];
  contextSize?: number;
  maxOutput?: number;
  defaultParameters?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  deprecated?: boolean;
  isDefault?: boolean;
  enabled?: boolean;
}

export interface UpdateModelPayload {
  modelType?: ModelType;
  displayName?: string;
  features?: string[];
  contextSize?: number;
  maxOutput?: number;
  defaultParameters?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  deprecated?: boolean;
  isDefault?: boolean;
  enabled?: boolean;
}

export async function fetchProviders(): Promise<ModelProvider[]> {
  return request(providersUrl());
}

export async function fetchProvider(id: string): Promise<ModelProvider> {
  return request(`${providersUrl()}/${id}`);
}

export async function createProvider(
  data: CreateProviderPayload,
): Promise<ModelProvider> {
  return request(providersUrl(), { method: 'POST', data });
}

export async function updateProvider(
  id: string,
  data: UpdateProviderPayload,
): Promise<ModelProvider> {
  return request(`${providersUrl()}/${id}`, { method: 'PATCH', data });
}

export async function deleteProvider(id: string): Promise<ModelProvider> {
  return request(`${providersUrl()}/${id}`, { method: 'DELETE' });
}

export async function createCredential(
  providerId: string,
  data: CredentialPayload,
): Promise<ProviderCredential> {
  return request(`${providersUrl()}/${providerId}/credentials`, {
    method: 'POST',
    data,
  });
}

export async function updateCredential(
  providerId: string,
  credentialId: string,
  data: UpdateCredentialPayload,
): Promise<ProviderCredential> {
  return request(
    `${providersUrl()}/${providerId}/credentials/${credentialId}`,
    {
      method: 'PATCH',
      data,
    },
  );
}

export async function setDefaultCredential(
  providerId: string,
  credentialId: string,
): Promise<ProviderCredential> {
  return request(
    `${providersUrl()}/${providerId}/credentials/${credentialId}/default`,
    {
      method: 'POST',
    },
  );
}

export async function validateCredential(
  providerId: string,
  credentialId: string,
) {
  return request(
    `${providersUrl()}/${providerId}/credentials/${credentialId}/validate`,
    {
      method: 'POST',
    },
  );
}

export async function deleteCredential(
  providerId: string,
  credentialId: string,
): Promise<ProviderCredential> {
  return request(
    `${providersUrl()}/${providerId}/credentials/${credentialId}`,
    {
      method: 'DELETE',
    },
  );
}

export async function createModel(
  providerId: string,
  data: ModelPayload,
): Promise<ProviderModel> {
  return request(`${providersUrl()}/${providerId}/models`, {
    method: 'POST',
    data,
  });
}

export async function updateModel(
  providerId: string,
  modelId: string,
  data: UpdateModelPayload,
): Promise<ProviderModel> {
  return request(`${providersUrl()}/${providerId}/models/${modelId}`, {
    method: 'PATCH',
    data,
  });
}

export async function setDefaultModel(
  providerId: string,
  modelId: string,
): Promise<ProviderModel> {
  return request(`${providersUrl()}/${providerId}/models/${modelId}/default`, {
    method: 'POST',
  });
}

export async function deleteModel(
  providerId: string,
  modelId: string,
): Promise<ProviderModel> {
  return request(`${providersUrl()}/${providerId}/models/${modelId}`, {
    method: 'DELETE',
  });
}

// 兼容旧命名，便于其他页面逐步迁移。
export const fetchPlatforms = fetchProviders;
export const fetchPlatform = fetchProvider;
export const createPlatform = createProvider;
export const updatePlatform = updateProvider;
export const deletePlatform = deleteProvider;
export type Platform = ModelProvider;
export type PlatformModel = ProviderModel;
export type CreatePlatformPayload = CreateProviderPayload;
export type UpdatePlatformPayload = UpdateProviderPayload;
export type CreateModelPayload = ModelPayload;
