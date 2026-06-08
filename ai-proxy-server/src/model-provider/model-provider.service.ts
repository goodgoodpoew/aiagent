import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialCryptoService } from './credential-crypto.service';
import {
  CreateModelProviderDto,
  CreateProviderCredentialDto,
  CreateProviderModelDto,
  UpdateModelProviderDto,
  UpdateProviderCredentialDto,
  UpdateProviderModelDto,
} from './dto/model-provider.dto';
import type { AdapterType, CredentialConfig, ModelType } from './model-provider.types';
import { ProviderCapabilityService } from './provider-capability.service';

export const MODEL_PROVIDER_EVENTS = {
  PROVIDER_CHANGED: 'model-provider.changed',
  CREDENTIALS_CHANGED: 'model-provider.credentials.changed',
  MODELS_CHANGED: 'model-provider.models.changed',
} as const;

const DEFAULT_CONFIG_SCHEMA = {
  fields: [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'baseUrl', label: 'Base URL', type: 'text', required: false },
  ],
};

@Injectable()
export class ModelProviderService {
  private readonly logger = new Logger(ModelProviderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly eventEmitter: EventEmitter2,
    private readonly httpService: HttpService,
    private readonly capabilityService: ProviderCapabilityService,
  ) {}

  async findAll() {
    const providers = await this.prisma.modelProvider.findMany({
      include: {
        credentials: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
        models: { orderBy: [{ modelType: 'asc' }, { createdAt: 'asc' }] },
      },
      orderBy: [{ systemBuiltIn: 'desc' }, { createdAt: 'asc' }],
    });

    return providers.map((provider) => this.serializeProvider(provider));
  }

  async findAllEnabledRaw() {
    return this.prisma.modelProvider.findMany({
      where: { enabled: true },
      include: {
        credentials: {
          where: { enabled: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
        models: {
          where: { enabled: true, deprecated: false },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ systemBuiltIn: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findById(id: string) {
    const provider = await this.prisma.modelProvider.findUnique({
      where: { id },
      include: {
        credentials: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
        models: { orderBy: [{ modelType: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!provider) throw new NotFoundException('供应商不存在');
    return this.serializeProvider(provider, true);
  }

  async findRawByName(name: string) {
    return this.prisma.modelProvider.findUnique({
      where: { name },
      include: {
        credentials: {
          where: { enabled: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
        models: {
          where: { enabled: true, deprecated: false },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async create(dto: CreateModelProviderDto) {
    const existing = await this.prisma.modelProvider.findUnique({ where: { name: dto.name } });
    if (existing) throw new BadRequestException(`供应商 "${dto.name}" 已存在`);

    const provider = await this.prisma.modelProvider.create({
      data: {
        ...dto,
        providerType: dto.providerType ?? 'custom',
        adapterType: dto.adapterType ?? 'openai-compatible',
        systemBuiltIn: dto.systemBuiltIn ?? false,
        configSchema: this.toJson(dto.configSchema ?? DEFAULT_CONFIG_SCHEMA),
      },
    });
    this.emitProviderChanged(provider.name);
    return provider;
  }

  async update(id: string, dto: UpdateModelProviderDto) {
    const provider = await this.assertProvider(id);
    const result = await this.prisma.modelProvider.update({
      where: { id },
      data: {
        ...dto,
        configSchema: dto.configSchema ? this.toJson(dto.configSchema) : undefined,
      },
    });
    this.emitProviderChanged(provider.name);
    return result;
  }

  async delete(id: string) {
    const provider = await this.assertProvider(id);
    const result = await this.prisma.modelProvider.update({
      where: { id },
      data: { enabled: false },
    });
    this.emitProviderChanged(provider.name);
    return result;
  }

  async createCredential(providerId: string, dto: CreateProviderCredentialDto) {
    const provider = await this.assertProvider(providerId);
    const config = this.normalizeCredentialConfig(dto.config);

    if (dto.isDefault) {
      await this.clearDefaultCredentials(providerId);
    }

    const credential = await this.prisma.modelProviderCredential.create({
      data: {
        providerId,
        name: dto.name,
        encryptedConfig: this.crypto.encrypt(config),
        isDefault: dto.isDefault ?? false,
        enabled: dto.enabled ?? true,
      },
    });

    if (!dto.isDefault) {
      await this.ensureDefaultCredential(providerId);
    }

    this.emitCredentialsChanged(provider.name);
    return this.serializeCredential(credential);
  }

  async updateCredential(
    providerId: string,
    credentialId: string,
    dto: UpdateProviderCredentialDto,
  ) {
    const provider = await this.assertProvider(providerId);
    await this.assertCredential(providerId, credentialId);

    if (dto.isDefault) {
      await this.clearDefaultCredentials(providerId);
    }

    const data = {
      name: dto.name,
      encryptedConfig: dto.config
        ? this.crypto.encrypt(this.normalizeCredentialConfig(dto.config))
        : undefined,
      isDefault: dto.isDefault,
      enabled: dto.enabled,
      lastValidationError: dto.config ? null : undefined,
      lastValidatedAt: dto.config ? null : undefined,
    };

    const credential = await this.prisma.modelProviderCredential.update({
      where: { id: credentialId },
      data,
    });

    if (dto.enabled !== false) {
      await this.ensureDefaultCredential(providerId);
    }

    this.emitCredentialsChanged(provider.name);
    return this.serializeCredential(credential);
  }

  async setDefaultCredential(providerId: string, credentialId: string) {
    const provider = await this.assertProvider(providerId);
    await this.assertCredential(providerId, credentialId);
    await this.clearDefaultCredentials(providerId);
    const credential = await this.prisma.modelProviderCredential.update({
      where: { id: credentialId },
      data: { isDefault: true, enabled: true },
    });
    this.emitCredentialsChanged(provider.name);
    return this.serializeCredential(credential);
  }

  async deleteCredential(providerId: string, credentialId: string) {
    const provider = await this.assertProvider(providerId);
    await this.assertCredential(providerId, credentialId);
    const credential = await this.prisma.modelProviderCredential.update({
      where: { id: credentialId },
      data: { enabled: false, isDefault: false },
    });
    await this.ensureDefaultCredential(providerId);
    this.emitCredentialsChanged(provider.name);
    return this.serializeCredential(credential);
  }

  async validateCredential(providerId: string, credentialId: string) {
    const provider = await this.assertProvider(providerId);
    const credential = await this.assertCredential(providerId, credentialId);
    const config = this.crypto.decrypt(credential.encryptedConfig);

    try {
      if (provider.adapterType !== 'openai-compatible') {
        throw new Error(`暂不支持 ${provider.adapterType} 原生适配器连通性校验`);
      }

      const baseUrl = this.resolveBaseUrl(provider.baseUrl, config);
      const apiKey = this.resolveApiKey(config);
      await firstValueFrom(
        this.httpService.get(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 10000,
        }),
      );

      const result = await this.prisma.modelProviderCredential.update({
        where: { id: credentialId },
        data: { lastValidatedAt: new Date(), lastValidationError: null },
      });
      this.emitCredentialsChanged(provider.name);
      return { ok: true, credential: this.serializeCredential(result) };
    } catch (error) {
      const message = error instanceof Error ? error.message : '凭据校验失败';
      this.logger.warn(`供应商凭据校验失败: ${provider.name}/${credential.name} - ${message}`);
      const result = await this.prisma.modelProviderCredential.update({
        where: { id: credentialId },
        data: { lastValidatedAt: new Date(), lastValidationError: message },
      });
      this.emitCredentialsChanged(provider.name);
      return { ok: false, error: message, credential: this.serializeCredential(result) };
    }
  }

  async createModel(providerId: string, dto: CreateProviderModelDto) {
    const provider = await this.assertProvider(providerId);
    const modelType = dto.modelType ?? 'llm';

    if (dto.isDefault) {
      await this.clearDefaultModels(providerId, modelType);
    }

    const model = await this.prisma.providerModel.create({
      data: {
        providerId,
        modelType,
        name: dto.name,
        displayName: dto.displayName,
        features: this.toJson(dto.features ?? []),
        contextSize: dto.contextSize,
        maxOutput: dto.maxOutput,
        defaultParameters: dto.defaultParameters ? this.toJson(dto.defaultParameters) : undefined,
        pricing: dto.pricing ? this.toJson(dto.pricing) : undefined,
        deprecated: dto.deprecated ?? false,
        isDefault: dto.isDefault ?? false,
        enabled: dto.enabled ?? true,
      },
    });

    if (!dto.isDefault) {
      await this.ensureDefaultModel(providerId, modelType);
    }

    this.emitModelsChanged(provider.name);
    return this.serializeModel(model, provider);
  }

  async updateModel(providerId: string, modelId: string, dto: UpdateProviderModelDto) {
    const provider = await this.assertProvider(providerId);
    const current = await this.assertModel(providerId, modelId);
    const modelType = dto.modelType ?? current.modelType;

    if (dto.isDefault) {
      await this.clearDefaultModels(providerId, modelType);
    }

    const model = await this.prisma.providerModel.update({
      where: { id: modelId },
      data: {
        modelType: dto.modelType,
        displayName: dto.displayName,
        features: dto.features ? this.toJson(dto.features) : undefined,
        contextSize: dto.contextSize,
        maxOutput: dto.maxOutput,
        defaultParameters: dto.defaultParameters ? this.toJson(dto.defaultParameters) : undefined,
        pricing: dto.pricing ? this.toJson(dto.pricing) : undefined,
        deprecated: dto.deprecated,
        isDefault: dto.isDefault,
        enabled: dto.enabled,
      },
    });

    await this.ensureDefaultModel(providerId, model.modelType);
    this.emitModelsChanged(provider.name);
    return this.serializeModel(model, provider);
  }

  async setDefaultModel(providerId: string, modelId: string) {
    const provider = await this.assertProvider(providerId);
    const current = await this.assertModel(providerId, modelId);
    await this.clearDefaultModels(providerId, current.modelType);
    const model = await this.prisma.providerModel.update({
      where: { id: modelId },
      data: { isDefault: true, enabled: true },
    });
    this.emitModelsChanged(provider.name);
    return this.serializeModel(model, provider);
  }

  async deleteModel(providerId: string, modelId: string) {
    const provider = await this.assertProvider(providerId);
    const current = await this.assertModel(providerId, modelId);
    const model = await this.prisma.providerModel.update({
      where: { id: modelId },
      data: { enabled: false, isDefault: false },
    });
    await this.ensureDefaultModel(providerId, current.modelType);
    this.emitModelsChanged(provider.name);
    return this.serializeModel(model, provider);
  }

  decryptCredentialConfig(encryptedConfig: string): CredentialConfig {
    return this.crypto.decrypt(encryptedConfig);
  }

  resolveBaseUrl(providerBaseUrl: string, config: CredentialConfig): string {
    const baseUrl =
      typeof config.baseUrl === 'string' && config.baseUrl ? config.baseUrl : providerBaseUrl;
    return baseUrl.replace(/\/+$/, '');
  }

  resolveApiKey(config: CredentialConfig): string {
    if (typeof config.apiKey !== 'string' || !config.apiKey) {
      throw new BadRequestException('模型供应商凭据未配置 API Key');
    }
    return config.apiKey;
  }

  private async assertProvider(id: string) {
    const provider = await this.prisma.modelProvider.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('供应商不存在');
    return provider;
  }

  private async assertCredential(providerId: string, credentialId: string) {
    const credential = await this.prisma.modelProviderCredential.findFirst({
      where: { id: credentialId, providerId },
    });
    if (!credential) throw new NotFoundException('供应商凭据不存在');
    return credential;
  }

  private async assertModel(providerId: string, modelId: string) {
    const model = await this.prisma.providerModel.findFirst({
      where: { id: modelId, providerId },
    });
    if (!model) throw new NotFoundException('模型不存在');
    return model;
  }

  private async clearDefaultCredentials(providerId: string) {
    await this.prisma.modelProviderCredential.updateMany({
      where: { providerId, isDefault: true },
      data: { isDefault: false },
    });
  }

  private async ensureDefaultCredential(providerId: string) {
    const existing = await this.prisma.modelProviderCredential.findFirst({
      where: { providerId, enabled: true, isDefault: true },
    });
    if (existing) return;

    const first = await this.prisma.modelProviderCredential.findFirst({
      where: { providerId, enabled: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!first) return;

    await this.prisma.modelProviderCredential.update({
      where: { id: first.id },
      data: { isDefault: true },
    });
  }

  private async clearDefaultModels(providerId: string, modelType: string) {
    await this.prisma.providerModel.updateMany({
      where: { providerId, modelType, isDefault: true },
      data: { isDefault: false },
    });
  }

  private async ensureDefaultModel(providerId: string, modelType: string) {
    const existing = await this.prisma.providerModel.findFirst({
      where: { providerId, modelType, enabled: true, deprecated: false, isDefault: true },
    });
    if (existing) return;

    const first = await this.prisma.providerModel.findFirst({
      where: { providerId, modelType, enabled: true, deprecated: false },
      orderBy: { createdAt: 'asc' },
    });
    if (!first) return;

    await this.prisma.providerModel.update({
      where: { id: first.id },
      data: { isDefault: true },
    });
  }

  private normalizeCredentialConfig(config: Record<string, unknown>): CredentialConfig {
    return Object.entries(config).reduce<CredentialConfig>((acc, [key, value]) => {
      if (value === undefined || value === null || value === '') return acc;
      acc[key] = value;
      return acc;
    }, {});
  }

  private serializeProvider(provider: any, includeGroups = false) {
    const credentials =
      provider.credentials?.map((credential) => this.serializeCredential(credential)) ?? [];
    const models: any[] = provider.models ?? [];
    const serializedModels = models.map((model) => this.serializeModel(model, provider));
    const modelStats = models.reduce((acc: Record<string, number>, model: any) => {
      if (model.enabled) acc[model.modelType] = (acc[model.modelType] ?? 0) + 1;
      return acc;
    }, {});

    const base = {
      id: provider.id,
      name: provider.name,
      displayName: provider.displayName,
      providerType: provider.providerType,
      iconUrl: provider.iconUrl,
      baseUrl: provider.baseUrl,
      adapterType: provider.adapterType as AdapterType,
      enabled: provider.enabled,
      systemBuiltIn: provider.systemBuiltIn,
      configSchema: provider.configSchema,
      configured: credentials.some((credential) => credential.enabled),
      credentials,
      modelStats,
      models: includeGroups ? undefined : serializedModels,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };

    if (!includeGroups) return base;

    return {
      ...base,
      modelsByType: serializedModels.reduce(
        (acc: Record<ModelType, unknown[]>, model: any) => {
          const modelType = model.modelType as ModelType;
          acc[modelType] = acc[modelType] ?? [];
          acc[modelType].push(model);
          return acc;
        },
        {} as Record<ModelType, unknown[]>,
      ),
    };
  }

  private serializeModel(model: any, provider: any) {
    return {
      id: model.id,
      providerId: model.providerId,
      modelType: model.modelType,
      name: model.name,
      displayName: model.displayName,
      features: model.features,
      capabilities: this.capabilityService.resolveModelCapabilities({
        providerName: provider.name,
        adapterType: provider.adapterType as AdapterType,
        modelName: model.name,
        modelType: model.modelType as ModelType,
        features: model.features,
      }),
      contextSize: model.contextSize,
      maxOutput: model.maxOutput,
      defaultParameters: model.defaultParameters,
      pricing: model.pricing,
      deprecated: model.deprecated,
      isDefault: model.isDefault,
      enabled: model.enabled,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };
  }

  private serializeCredential(credential: any) {
    let maskedConfig: Record<string, unknown> = {};
    try {
      maskedConfig = this.crypto.mask(this.crypto.decrypt(credential.encryptedConfig));
    } catch {
      maskedConfig = {};
    }

    return {
      id: credential.id,
      providerId: credential.providerId,
      name: credential.name,
      configured: true,
      maskedConfig,
      isDefault: credential.isDefault,
      enabled: credential.enabled,
      lastValidatedAt: credential.lastValidatedAt,
      lastValidationError: credential.lastValidationError,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private emitProviderChanged(providerName: string) {
    this.eventEmitter.emit(MODEL_PROVIDER_EVENTS.PROVIDER_CHANGED, { providerName });
  }

  private emitCredentialsChanged(providerName: string) {
    this.eventEmitter.emit(MODEL_PROVIDER_EVENTS.CREDENTIALS_CHANGED, { providerName });
  }

  private emitModelsChanged(providerName: string) {
    this.eventEmitter.emit(MODEL_PROVIDER_EVENTS.MODELS_CHANGED, { providerName });
  }
}
