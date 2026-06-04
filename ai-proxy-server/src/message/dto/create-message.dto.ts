import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  role!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
