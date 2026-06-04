import { IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class CreateModelDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateModelDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  displayName?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
