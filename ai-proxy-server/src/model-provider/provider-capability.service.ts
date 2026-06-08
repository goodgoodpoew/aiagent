import { Injectable } from '@nestjs/common';
import type {
  AdapterType,
  ModelType,
  ProviderModelCapabilities,
  ProviderModelFeatures,
  ProviderReasoningCapability,
} from './model-provider.types';

interface ResolveCapabilitiesInput {
  providerName: string;
  adapterType: AdapterType;
  modelName: string;
  modelType: ModelType;
  features: ProviderModelFeatures;
}

@Injectable()
export class ProviderCapabilityService {
  resolveModelCapabilities(input: ResolveCapabilitiesInput): ProviderModelCapabilities {
    const base = this.defaultCapabilities(input.modelType);
    const featureCapabilities = this.capabilitiesFromFeatures(input.features);
    const providerDefaults = this.providerDefaults(input);

    return {
      chat: featureCapabilities.chat ?? providerDefaults.chat ?? base.chat,
      stream: featureCapabilities.stream ?? providerDefaults.stream ?? base.stream,
      toolCalling: {
        supported:
          featureCapabilities.toolCalling?.supported ??
          providerDefaults.toolCalling?.supported ??
          base.toolCalling.supported,
      },
      reasoning: this.mergeReasoning(
        base.reasoning,
        providerDefaults.reasoning,
        featureCapabilities.reasoning,
      ),
      vision: featureCapabilities.vision ?? providerDefaults.vision ?? base.vision,
      jsonMode: featureCapabilities.jsonMode ?? providerDefaults.jsonMode ?? base.jsonMode,
    };
  }

  private defaultCapabilities(modelType: ModelType): ProviderModelCapabilities {
    const isLlm = modelType === 'llm';
    return {
      chat: isLlm,
      stream: isLlm,
      toolCalling: { supported: false },
      reasoning: { supported: false },
      vision: false,
      jsonMode: false,
    };
  }

  private capabilitiesFromFeatures(
    features: ProviderModelFeatures,
  ): Partial<ProviderModelCapabilities> {
    if (Array.isArray(features)) {
      return this.capabilitiesFromFeatureList(features);
    }
    if (features && typeof features === 'object') {
      return this.capabilitiesFromFeatureObject(features);
    }
    return {};
  }

  private capabilitiesFromFeatureList(features: string[]): Partial<ProviderModelCapabilities> {
    const normalized = new Set(features.map((feature) => this.normalizeFeatureName(feature)));
    return {
      chat: this.hasAny(normalized, ['chat', 'text']),
      stream: this.hasAny(normalized, ['stream', 'streaming']),
      toolCalling: this.hasAny(normalized, ['tools', 'toolcalling', 'functioncalling'])
        ? { supported: true }
        : undefined,
      reasoning: this.hasAny(normalized, ['reasoning', 'reasoningeffort', 'thinking'])
        ? {
            supported: true,
            ...(this.hasAny(normalized, ['reasoningeffort'])
              ? { requestEffortParam: 'reasoning_effort' as const }
              : {}),
          }
        : undefined,
      vision: this.hasAny(normalized, ['vision', 'imageinput', 'multimodal']),
      jsonMode: this.hasAny(normalized, ['json', 'jsonmode', 'structuredoutput']),
    };
  }

  private capabilitiesFromFeatureObject(
    features: Record<string, unknown>,
  ): Partial<ProviderModelCapabilities> {
    const toolCalling = this.readBoolean(
      features.toolCalling ?? features.tools ?? features.functionCalling,
    );

    return {
      chat: this.readBoolean(features.chat),
      stream: this.readBoolean(features.stream ?? features.streaming),
      toolCalling: toolCalling === undefined ? undefined : { supported: toolCalling },
      reasoning: this.readReasoning(features.reasoning ?? features.thinking),
      vision: this.readBoolean(features.vision ?? features.imageInput ?? features.multimodal),
      jsonMode: this.readBoolean(features.jsonMode ?? features.json ?? features.structuredOutput),
    };
  }

  private providerDefaults(input: ResolveCapabilitiesInput): Partial<ProviderModelCapabilities> {
    if (input.adapterType !== 'openai-compatible' || input.modelType !== 'llm') {
      return {};
    }

    if (input.providerName === 'openai' || input.providerName === 'azure-openai') {
      return {
        reasoning: {
          supported: true,
          requestEffortParam: 'reasoning_effort',
        },
      };
    }

    return {};
  }

  private mergeReasoning(
    base: ProviderReasoningCapability,
    providerDefault?: ProviderReasoningCapability,
    featureValue?: ProviderReasoningCapability,
  ): ProviderReasoningCapability {
    const selected = featureValue ?? providerDefault ?? base;
    return {
      supported: selected.supported,
      ...(selected.requestEffortParam ? { requestEffortParam: selected.requestEffortParam } : {}),
    };
  }

  private readReasoning(value: unknown): ProviderReasoningCapability | undefined {
    if (typeof value === 'boolean') {
      return { supported: value };
    }
    if (!value || typeof value !== 'object') return undefined;

    const input = value as Record<string, unknown>;
    const supported = this.readBoolean(input.supported ?? input.enabled);
    if (supported === undefined) return undefined;

    return {
      supported,
      ...(input.requestEffortParam === 'reasoning_effort'
        ? { requestEffortParam: 'reasoning_effort' as const }
        : {}),
    };
  }

  private readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private hasAny(features: Set<string>, candidates: string[]): boolean | undefined {
    return candidates.some((candidate) => features.has(candidate)) ? true : undefined;
  }

  private normalizeFeatureName(feature: string): string {
    return feature.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}
