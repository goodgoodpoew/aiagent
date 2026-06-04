import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, Min, Max } from 'class-validator';
import { AiPlatform } from './chat.dto';

/**
 * v1 legacy 流式聊天请求 DTO。
 * 仅供 Ant Design X 示例页和旧客户端继续访问 /api/ai/chat/stream；
 * 主聊天页必须使用 ChatStreamRequestV2 + /api/ai/chat/stream/v2。
 */
export class ChatStreamDto {
  /**
   * 用户输入的查询内容
   */
  @IsString()
  query!: string;

  /**
   * 一次发送动作的幂等键，前端重试时必须复用同一个值
   */
  @IsOptional()
  @IsString()
  requestId?: string;

  /**
   * 前端乐观用户消息 ID，用于服务端真实消息回传后对齐
   */
  @IsOptional()
  @IsString()
  clientMessageId?: string;

  /**
   * 会话 ID
   */
  @IsOptional()
  @IsString()
  sessionId?: string;

  /**
   * 平台
   */
  @IsOptional()
  @IsString()
  platform?: AiPlatform;

  /**
   * 供应商
   */
  @IsOptional()
  @IsString()
  provider?: string;

  /**
   * 模型
   */
  @IsOptional()
  @IsString()
  model?: string;

  /**
   * 凭据 ID
   */
  @IsOptional()
  @IsString()
  credentialId?: string;

  /**
   * 温度
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  /**
   * 最大令牌数
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  max_tokens?: number;

  /**
   * 是否流式
   */
  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  /**
   * 附件 ID 列表
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];

  /**
   * 如果是首次发送消息，是否自动生成会话名称默认 true
   */
  @IsOptional()
  @IsBoolean()
  autoGenerateSessionName?: boolean;
}
