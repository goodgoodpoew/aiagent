import type { MessagePart } from '@/streaming/protocol/message-part.types';
import type { ReasoningRuntimeOptions } from '@/model-provider/model-provider.types';
import type { ToolDefinition } from '@/tools/dto/tool-definition.dto';

/**
 * AI 平台标识。
 * 保留旧字段名以兼容前端历史请求；实际由 `model_providers` 动态管理。
 */
export type AiPlatform = string;

// 聊天消息格式
export interface ChatMessage {
  role: string;
  content: string;
  /** content 是兼容文本投影；parts 为 v2 结构化消息预留，当前不改变 v1 请求处理。 */
  parts?: MessagePart[];
  tool_call_id?: string;
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
  platform?: AiPlatform;
  provider?: string;
  model?: string;
  credentialId?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  // 自定义平台时需要的额外配置
  customBaseUrl?: string;
  customApiKey?: string;
  // 文件附件 ID 列表
  fileIds?: string[];
  // v2 运行时 reasoning 控制项；不支持的 provider 会在代理层忽略请求侧参数。
  reasoning?: ReasoningRuntimeOptions;
  // v2 工具调用控制项；只允许引用后端注册表解析出的工具定义。
  tools?: ToolDefinition[];
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
