/**
 * AI 平台标识。
 * 保留旧字段名以兼容前端历史请求；实际由 `model_providers` 动态管理。
 */
export type AiPlatform = string;

// 聊天消息格式
export interface ChatMessage {
  role: string;
  content: string;
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
