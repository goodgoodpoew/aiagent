import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import type { MessagePart } from '@/streaming/protocol/message-part.types';
import type { ReasoningRuntimeOptions } from '@/model-provider/model-provider.types';
import type { ToolDefinition } from '@/tools/dto/tool-definition.dto';

/**
 * AI 平台标识。
 * 保留旧字段名以兼容前端历史请求；实际由 `model_providers` 动态管理。
 */
export type AiPlatform = string;

const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_.:-]+$/;
const MAX_ATTACHMENTS_PER_MESSAGE = Number(process.env.FILE_MAX_ATTACHMENTS_PER_MESSAGE ?? 5);

function isToolChoiceObject(value: unknown): value is { type: 'tool'; name: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'tool' &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

@ValidatorConstraint({ name: 'legacyToolChoiceReferencesTool', async: false })
class LegacyToolChoiceReferencesToolConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    if (value === undefined || value === null || value === 'auto' || value === 'none') {
      return true;
    }

    if (!isToolChoiceObject(value) || !SAFE_IDENTIFIER_PATTERN.test(value.name)) {
      return false;
    }

    const dto = args.object as ChatRequestDto;
    const tools = dto.tools ?? [];
    return tools.some((tool) => tool.name === value.name);
  }

  defaultMessage() {
    return 'toolChoice 必须为 auto、none，或引用 tools 中已启用的工具';
  }
}

// 聊天消息格式
export class ChatMessage {
  @IsIn(['system', 'user', 'assistant', 'tool'])
  role!: string;

  @IsString()
  @MaxLength(20000)
  content!: string;

  /** content 是给 OpenAI-compatible provider 的文本投影；parts 保留 v2 结构化消息。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  parts?: MessagePart[];

  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  tool_call_id?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

// 通用聊天请求 DTO
export class ChatRequestDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  platform?: AiPlatform;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  provider?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  model?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  credentialId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ChatMessage)
  messages!: ChatMessage[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(128000)
  max_tokens?: number;

  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  // 自定义平台时需要的额外配置
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  customBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  customApiKey?: string;

  // 文件附件 ID 列表
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ATTACHMENTS_PER_MESSAGE)
  @IsString({ each: true })
  @Matches(SAFE_IDENTIFIER_PATTERN, { each: true })
  fileIds?: string[];

  // v2 运行时 reasoning 控制项；不支持的 provider 会在代理层忽略请求侧参数。
  @IsOptional()
  @IsObject()
  reasoning?: ReasoningRuntimeOptions;

  // v2 工具调用控制项；只允许引用后端注册表解析出的工具定义。
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  tools?: ToolDefinition[];

  @IsOptional()
  @Validate(LegacyToolChoiceReferencesToolConstraint)
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
}

// 聊天响应格式
export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
