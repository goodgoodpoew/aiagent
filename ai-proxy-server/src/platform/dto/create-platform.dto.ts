import { IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class CreatePlatformDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsString()
  baseUrl!: string;

  @IsString()
  apiKeyEnv!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdatePlatformDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  baseUrl?: string;

  @IsString()
  @IsOptional()
  apiKeyEnv?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
