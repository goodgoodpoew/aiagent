import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
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
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import type { StreamProtocolV2 } from '../protocol/stream-event.types';
import type { ToolDefinitionRef } from '@/tools/dto/tool-definition.dto';

const STREAM_PROTOCOL_V2: StreamProtocolV2 = 'aiagent.stream.v2';
const MAX_INPUT_PARTS = 20;
const MAX_TEXT_LENGTH = 20000;
const MAX_CONTEXT_FILES = Number(process.env.FILE_MAX_ATTACHMENTS_PER_MESSAGE ?? 5);
const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_.:-]+$/;

function isToolChoiceObject(value: unknown): value is { type: 'tool'; name: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'tool' &&
    typeof (value as { name?: unknown }).name === 'string'
  );
}

@ValidatorConstraint({ name: 'toolChoiceReferencesEnabledTool', async: false })
class ToolChoiceReferencesEnabledToolConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    if (value === undefined || value === null || value === 'auto' || value === 'none') {
      return true;
    }

    if (!isToolChoiceObject(value) || !SAFE_IDENTIFIER_PATTERN.test(value.name)) {
      return false;
    }

    const runtime = args.object as ChatRuntimeOptions;
    const tools = runtime.tools ?? [];
    return tools.some((tool) => tool.name === value.name);
  }

  defaultMessage() {
    return 'toolChoice 必须为 auto、none，或引用 runtime.tools 中已启用的工具';
  }
}

export class TextInputPart {
  @IsIn(['text'])
  type!: 'text';

  @IsString()
  @Length(1, MAX_TEXT_LENGTH)
  text!: string;
}

export class FileInputPart {
  @IsIn(['file'])
  type!: 'file';

  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  fileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;
}

export class ImageInputPart {
  @IsIn(['image'])
  type!: 'image';

  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  fileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @IsOptional()
  @IsIn(['low', 'high', 'auto'])
  detail?: 'low' | 'high' | 'auto';
}

export class ResourceReferencePart {
  @IsIn(['resource'])
  type!: 'resource';

  @IsString()
  @Length(1, 2048)
  uri!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsIn(['mcp', 'local', 'web', 'session'])
  source?: 'mcp' | 'local' | 'web' | 'session';
}

export class CommandInputPart {
  @IsIn(['command'])
  type!: 'command';

  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  name!: string;

  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;
}

export type UserMessagePart =
  | TextInputPart
  | FileInputPart
  | ImageInputPart
  | ResourceReferencePart
  | CommandInputPart;

export class UserMessageInput {
  @IsIn(['user'])
  role!: 'user';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_INPUT_PARTS)
  @ValidateNested({ each: true })
  @Type(() => TextInputPart, {
    discriminator: {
      property: 'type',
      subTypes: [
        { name: 'text', value: TextInputPart },
        { name: 'file', value: FileInputPart },
        { name: 'image', value: ImageInputPart },
        { name: 'resource', value: ResourceReferencePart },
        { name: 'command', value: CommandInputPart },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  parts!: UserMessagePart[];
}

export class ClientLocationInput {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}

export class ContextResourceInput {
  @IsString()
  @Length(1, 2048)
  uri!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  type?: string;

  @IsOptional()
  @IsIn(['mcp', 'local', 'web', 'session'])
  source?: 'mcp' | 'local' | 'web' | 'session';
}

export class ChatContextInput {
  @IsOptional()
  @IsBoolean()
  includeHistory?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  historyLimit?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CONTEXT_FILES)
  @IsString({ each: true })
  @Matches(SAFE_IDENTIFIER_PATTERN, { each: true })
  fileIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ClientLocationInput)
  clientLocation?: ClientLocationInput;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ContextResourceInput)
  resources?: ContextResourceInput[];
}

export class ToolDefinitionRefDto implements ToolDefinitionRef {
  @IsIn(['builtin', 'custom', 'mcp'])
  source!: 'builtin' | 'custom' | 'mcp';

  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  serverId?: string;
}

export class ChatReasoningOptions {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  effort?: 'low' | 'medium' | 'high';

  @IsOptional()
  @IsIn(['none', 'summary', 'full'])
  display?: 'none' | 'summary' | 'full';
}

export class ChatRuntimeOptions {
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(128000)
  maxTokens?: number;

  @IsOptional()
  @IsIn([true])
  stream?: true;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ToolDefinitionRefDto)
  tools?: ToolDefinitionRefDto[];

  @IsOptional()
  @Validate(ToolChoiceReferencesEnabledToolConstraint)
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatReasoningOptions)
  reasoning?: ChatReasoningOptions;

  @IsOptional()
  @IsBoolean()
  autoGenerateSessionName?: boolean;
}

export class JsonSchemaResponseFormat {
  @IsIn(['json_schema'])
  type!: 'json_schema';

  @IsObject()
  schema!: Record<string, unknown>;
}

export class ChatResponseOptions {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(['text', 'image', 'file', 'json'], { each: true })
  modalities?: Array<'text' | 'image' | 'file' | 'json'>;

  @IsOptional()
  format?: 'text' | 'json_object' | JsonSchemaResponseFormat;
}

export class ChatStreamRequestV2 {
  @IsIn([STREAM_PROTOCOL_V2])
  protocol!: StreamProtocolV2;

  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  requestId!: string;

  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  clientMessageId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  @Matches(SAFE_IDENTIFIER_PATTERN)
  sessionId?: string;

  @ValidateNested()
  @Type(() => UserMessageInput)
  input!: UserMessageInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatContextInput)
  context?: ChatContextInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatRuntimeOptions)
  runtime?: ChatRuntimeOptions;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatResponseOptions)
  response?: ChatResponseOptions;
}
