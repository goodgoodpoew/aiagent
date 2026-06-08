import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RedisService } from '../redis/redis.service';
import { ModelProviderService, MODEL_PROVIDER_EVENTS } from './model-provider.service';
import type {
  AdapterType,
  CredentialConfig,
  ModelType,
  ProviderModelCapabilities,
  ProviderModelFeatures,
  ResolvedChatProvider,
} from './model-provider.types';
import { ProviderCapabilityService } from './provider-capability.service';

interface CachedProvider {
  name: string;
  displayName: string;
  baseUrl: string;
  adapterType: AdapterType;
  enabled: boolean;
  configured: boolean;
}

interface CachedModel {
  name: string;
  displayName: string;
  modelType: ModelType;
  isDefault: boolean;
  capabilities: ProviderModelCapabilities;
}

@Injectable()
export class ModelProviderRegistryService {
  private readonly logger = new Logger(ModelProviderRegistryService.name);
  private readonly CACHE_KEY_PROVIDERS = 'registry:model-providers';
  private readonly CACHE_KEY_MODELS_PREFIX = 'registry:model-provider:models:';
  private readonly CACHE_TTL = 300;

  constructor(
    private readonly modelProviderService: ModelProviderService,
    private readonly redis: RedisService,
    private readonly capabilityService: ProviderCapabilityService,
  ) {}

  async listEnabledProviders(): Promise<CachedProvider[]> {
    const cached = await this.redis.getJson<CachedProvider[]>(this.CACHE_KEY_PROVIDERS);
    if (cached) return cached;

    const providers = await this.modelProviderService.findAllEnabledRaw();
    const info = providers.map((provider) => ({
      name: provider.name,
      displayName: provider.displayName,
      baseUrl: provider.baseUrl,
      adapterType: provider.adapterType as AdapterType,
      enabled: provider.enabled,
      configured: provider.credentials.some((credential) => credential.enabled),
    }));

    await this.redis.setJson(this.CACHE_KEY_PROVIDERS, info, this.CACHE_TTL);
    return info;
  }

  async resolveProvider(input?: string): Promise<string> {
    const providers = await this.listEnabledProviders();
    if (providers.length === 0) {
      throw new BadRequestException('没有可用的模型供应商');
    }

    if (input) {
      const found = providers.find((provider) => provider.name === input);
      if (!found) throw new BadRequestException(`模型供应商 "${input}" 不存在或未启用`);
      return input;
    }

    const configured = providers.find((provider) => provider.configured);
    if (!configured) {
      throw new BadRequestException('没有已配置凭据的模型供应商');
    }
    return configured.name;
  }

  async listModels(providerName: string, modelType: ModelType = 'llm'): Promise<CachedModel[]> {
    const cacheKey = this.CACHE_KEY_MODELS_PREFIX + providerName + ':' + modelType;
    const cached = await this.redis.getJson<CachedModel[]>(cacheKey);
    if (cached) return cached;

    const provider = await this.modelProviderService.findRawByName(providerName);
    if (!provider || !provider.enabled) {
      throw new BadRequestException(`模型供应商 "${providerName}" 不存在或未启用`);
    }

    const models = provider.models
      .filter((model) => model.modelType === modelType)
      .map((model) => ({
        name: model.name,
        displayName: model.displayName,
        modelType: model.modelType as ModelType,
        isDefault: model.isDefault,
        capabilities: this.capabilityService.resolveModelCapabilities({
          providerName: provider.name,
          adapterType: provider.adapterType as AdapterType,
          modelName: model.name,
          modelType: model.modelType as ModelType,
          features: model.features as ProviderModelFeatures,
        }),
      }));

    await this.redis.setJson(cacheKey, models, this.CACHE_TTL);
    return models;
  }

  async resolveModel(
    providerName: string,
    input?: string,
    modelType: ModelType = 'llm',
  ): Promise<string> {
    const models = await this.listModels(providerName, modelType);
    if (input) {
      const found = models.find((model) => model.name === input);
      if (!found) {
        throw new BadRequestException(
          `模型供应商 "${providerName}" 未启用 ${modelType} 模型 "${input}"`,
        );
      }
      return input;
    }

    if (models.length === 0) {
      throw new BadRequestException(`模型供应商 "${providerName}" 没有可用的 ${modelType} 模型`);
    }

    return (models.find((model) => model.isDefault) ?? models[0]).name;
  }

  async resolveChatProvider(params: {
    provider?: string;
    platform?: string;
    model?: string;
    credentialId?: string;
    customBaseUrl?: string;
    customApiKey?: string;
  }): Promise<ResolvedChatProvider> {
    const requestedProvider = params.provider ?? params.platform;

    if (requestedProvider === 'custom' && params.customBaseUrl && params.customApiKey) {
      const capabilities = this.capabilityService.resolveModelCapabilities({
        providerName: 'custom',
        adapterType: 'openai-compatible',
        modelName: params.model || 'custom-model',
        modelType: 'llm',
        features: ['chat', 'stream'],
      });
      return {
        provider: 'custom',
        providerDisplayName: '自定义',
        model: params.model || 'custom-model',
        baseUrl: params.customBaseUrl.replace(/\/+$/, ''),
        apiKey: params.customApiKey,
        adapterType: 'openai-compatible',
        capabilities,
        reasoning: capabilities.reasoning,
        toolCalling: capabilities.toolCalling,
      };
    }

    const providerName = await this.resolveProvider(requestedProvider);
    const model = await this.resolveModel(providerName, params.model, 'llm');
    const provider = await this.modelProviderService.findRawByName(providerName);
    if (!provider || !provider.enabled) {
      throw new BadRequestException(`模型供应商 "${providerName}" 不存在或未启用`);
    }
    const resolvedModel = provider.models.find(
      (item) => item.modelType === 'llm' && item.name === model,
    );
    const capabilities = resolvedModel
      ? this.capabilityService.resolveModelCapabilities({
          providerName: provider.name,
          adapterType: provider.adapterType as AdapterType,
          modelName: resolvedModel.name,
          modelType: resolvedModel.modelType as ModelType,
          features: resolvedModel.features as ProviderModelFeatures,
        })
      : undefined;

    const credential =
      (params.credentialId
        ? provider.credentials.find((item) => item.id === params.credentialId)
        : provider.credentials.find((item) => item.isDefault)) ?? provider.credentials[0];

    if (!credential) {
      throw new BadRequestException(`模型供应商 "${providerName}" 没有可用凭据`);
    }

    const config: CredentialConfig = this.modelProviderService.decryptCredentialConfig(
      credential.encryptedConfig,
    );
    const baseUrl = this.modelProviderService.resolveBaseUrl(provider.baseUrl, config);
    const apiKey = this.modelProviderService.resolveApiKey(config);

    return {
      provider: provider.name,
      providerDisplayName: provider.displayName,
      model,
      credentialId: credential.id,
      baseUrl,
      apiKey,
      adapterType: provider.adapterType as AdapterType,
      capabilities,
      reasoning: capabilities?.reasoning,
      toolCalling: capabilities?.toolCalling,
    };
  }

  @OnEvent(MODEL_PROVIDER_EVENTS.PROVIDER_CHANGED)
  private async handleProviderChanged(payload?: { providerName?: string }) {
    this.logger.debug('模型供应商变更，失效供应商缓存');
    await this.redis.del(this.CACHE_KEY_PROVIDERS);
    if (payload?.providerName) {
      await this.invalidateModelCaches(payload.providerName);
    }
  }

  @OnEvent(MODEL_PROVIDER_EVENTS.CREDENTIALS_CHANGED)
  private async handleCredentialsChanged(payload: { providerName: string }) {
    await this.redis.del(this.CACHE_KEY_PROVIDERS);
    await this.invalidateModelCaches(payload.providerName);
  }

  @OnEvent(MODEL_PROVIDER_EVENTS.MODELS_CHANGED)
  private async handleModelsChanged(payload: { providerName: string }) {
    await this.invalidateModelCaches(payload.providerName);
  }

  async invalidateProviderCache() {
    await this.redis.del(this.CACHE_KEY_PROVIDERS);
  }

  async invalidateModelCaches(providerName: string) {
    await this.redis.del(
      ...['llm', 'text-embedding', 'rerank', 'speech-to-text', 'tts', 'image'].map(
        (modelType) => this.CACHE_KEY_MODELS_PREFIX + providerName + ':' + modelType,
      ),
    );
  }
}
