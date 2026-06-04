import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ADAPTER_TYPES, MODEL_TYPES, PROVIDER_TYPES } from '../model-provider.types';
import type { AdapterType, ModelType, ProviderType } from '../model-provider.types';

export class CreateModelProviderDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsIn(PROVIDER_TYPES)
  @IsOptional()
  providerType?: ProviderType;

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsString()
  baseUrl!: string;

  @IsIn(ADAPTER_TYPES)
  @IsOptional()
  adapterType?: AdapterType;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  systemBuiltIn?: boolean;

  @IsObject()
  @IsOptional()
  configSchema?: Record<string, unknown>;
}

export class UpdateModelProviderDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  displayName?: string;

  @IsIn(PROVIDER_TYPES)
  @IsOptional()
  providerType?: ProviderType;

  @IsString()
  @IsOptional()
  iconUrl?: string;

  @IsString()
  @IsOptional()
  baseUrl?: string;

  @IsIn(ADAPTER_TYPES)
  @IsOptional()
  adapterType?: AdapterType;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  systemBuiltIn?: boolean;

  @IsObject()
  @IsOptional()
  configSchema?: Record<string, unknown>;
}

export class CreateProviderCredentialDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsObject()
  config!: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateProviderCredentialDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class CreateProviderModelDto {
  @IsIn(MODEL_TYPES)
  @IsOptional()
  modelType?: ModelType;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsOptional()
  features?: Record<string, unknown> | string[];

  @IsInt()
  @Min(1)
  @IsOptional()
  contextSize?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxOutput?: number;

  @IsObject()
  @IsOptional()
  defaultParameters?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  pricing?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateProviderModelDto {
  @IsIn(MODEL_TYPES)
  @IsOptional()
  modelType?: ModelType;

  @IsString()
  @MinLength(1)
  @IsOptional()
  displayName?: string;

  @IsOptional()
  features?: Record<string, unknown> | string[];

  @IsInt()
  @Min(1)
  @IsOptional()
  contextSize?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxOutput?: number;

  @IsObject()
  @IsOptional()
  defaultParameters?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  pricing?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  deprecated?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
