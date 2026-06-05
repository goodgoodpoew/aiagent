import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { ChatRequestDto, AiPlatform } from './dto/chat.dto';
import { ModelProviderRegistryService } from '../model-provider/model-provider-registry.service';
import type { ResolvedChatProvider } from '../model-provider/model-provider.types';
import { firstValueFrom } from 'rxjs';
import { sanitizeStreamError } from './errors/stream-error.util';
import { StreamProxyError } from './errors/stream-proxy.error';
import { FileService } from '@/files/file.service';

@Injectable()
export class AiProxyService {
  private readonly logger = new Logger(AiProxyService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly modelProviderRegistry: ModelProviderRegistryService,
    private readonly fileService: FileService,
  ) { }

  /**
   * 获取平台配置：baseUrl + apiKey
   * custom 平台特殊处理：baseUrl/apiKey 由前端传入，不走注册表
   */
  private throwProxyError(error: unknown): never {
    if (error instanceof StreamProxyError) {
      throw error;
    }
    throw new StreamProxyError(sanitizeStreamError(error));
  }

  private async getProviderConfig(dto: ChatRequestDto) {
    const resolved = await this.modelProviderRegistry.resolveChatProvider({
      provider: dto.provider,
      platform: dto.platform,
      model: dto.model,
      credentialId: dto.credentialId,
      customBaseUrl: dto.customBaseUrl,
      customApiKey: dto.customApiKey,
    });

    if (resolved.adapterType !== 'openai-compatible') {
      throw new StreamProxyError(
        sanitizeStreamError(new Error(`暂不支持 ${resolved.adapterType} 原生模型适配器`)),
      );
    }

    return resolved;
  }

  private buildChatCompletionPayload(
    resolved: ResolvedChatProvider,
    dto: ChatRequestDto,
    stream: boolean,
  ) {
    const payload: Record<string, unknown> = {
      model: resolved.model,
      messages: dto.messages,
      temperature: dto.temperature ?? 0.7,
      max_tokens: dto.max_tokens ?? 4096,
      stream,
    };

    // 只在明确支持请求侧 effort 参数的 provider 上传递 reasoning 配置；
    // DeepSeek 等 provider 即使不需要请求参数，也仍可由 adapter 识别返回的 reasoning_content。
    if (dto.reasoning?.enabled && dto.reasoning.effort && resolved.reasoning?.supported) {
      payload[resolved.reasoning.requestEffortParam ?? 'reasoning_effort'] = dto.reasoning.effort;
    }

    if (dto.tools?.length) {
      // OpenAI-compatible provider 使用 function tools；schema 只来自后端注册表解析结果。
      payload.tools = dto.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
      if (dto.toolChoice === 'none') {
        payload.tool_choice = 'none';
      } else if (dto.toolChoice && typeof dto.toolChoice === 'object') {
        payload.tool_choice = {
          type: 'function',
          function: { name: dto.toolChoice.name },
        };
      } else {
        payload.tool_choice = 'auto';
      }
    }

    return payload;
  }

  /**
   * 非流式聊天请求代理
   */
  async proxyChat(dto: ChatRequestDto) {
    const resolved = await this.getProviderConfig(dto);
    const { baseUrl, apiKey, provider, model } = resolved;

    this.logger.log(`Proxying chat request → ${provider}/${model}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/chat/completions`,
          this.buildChatCompletionPayload(resolved, dto, false),
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
          },
        ),
      );
      return response.data;
    } catch (error) {
      this.throwProxyError(error);
    }
  }

  /**
   * 接受用户第一次消息，请求模型生成会话标题
   */
  async generateSessionTitle(dto: ChatRequestDto): Promise<string> {
    const currentDto = { ...dto };
    // 注入提示词
    let prompt = `
    你是会话标题生成器，请根据用户第一次消息生成会话标题，标题要求简洁明了，不超过10个字。
    用户第一次消息：${currentDto.messages[0].content}`;
    if (currentDto.fileIds?.length && currentDto.fileIds.length > 0) {
      // 获取所有文件的标题即可
      const fileTitlesPromise = Promise.all(currentDto.fileIds.map(async (fileId) => {
        const file = await this.fileService.findById(fileId);
        return file.name;
      }));
      const fileTitles = await fileTitlesPromise;
      prompt += `\n用户上传了附件内容：${fileTitles.join(',')}`;
    }
    currentDto.messages[0].content = prompt;
    const result = await this.proxyChat(currentDto);
    const raw = (result as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
      ?.message?.content;
    const title = typeof raw === 'string' ? raw.trim().slice(0, 200) : '';
    return title;
  }

  /**
   * 流式聊天请求代理 - 只负责连接上游并返回原始 Node stream。
   * 注意：这里不解析 provider SSE，也不写给前端；协议归一化由 OpenAiCompatibleStreamAdapter
   * 和 StreamOrchestratorService 完成，避免代理层同时承担网络和业务编排。
   */
  async proxyChatStream(dto: ChatRequestDto) {
    const resolved = await this.getProviderConfig(dto);
    const { baseUrl, apiKey, provider, model } = resolved;

    this.logger.log(`Proxying stream chat → ${provider}/${model}`);

    try {
      const axiosResponse = await firstValueFrom(
        this.httpService.post(
          `${baseUrl}/chat/completions`,
          this.buildChatCompletionPayload(resolved, dto, true),
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            // responseType: 'stream' 让 axios 不等待完整回答，而是把上游 SSE 字节流原样交给后续编排层。
            responseType: 'stream',
          },
        ),
      );

      return axiosResponse.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `流式代理失败 → ${provider}/${model}`,
          sanitizeStreamError(error).logDetail,
        );
      }
      this.throwProxyError(error);
    }
  }

  /**
   * 健康检查 - 验证平台连通性
   */
  async healthCheck(platform?: AiPlatform) {
    if (!platform) {
      const platforms = await this.modelProviderRegistry.listEnabledProviders();
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        platforms: platforms.map((p) => ({
          platform: p.name,
          displayName: p.displayName,
          configured: p.configured,
          adapterType: p.adapterType,
        })),
      };
    }

    const provider = (await this.modelProviderRegistry.listEnabledProviders()).find(
      (item) => item.name === platform,
    );
    if (!provider) {
      throw new StreamProxyError(
        sanitizeStreamError(new Error(`模型供应商不存在或未启用: ${platform}`)),
      );
    }
    return {
      platform,
      baseUrl: provider.baseUrl,
      configured: provider.configured,
      adapterType: provider.adapterType,
      timestamp: new Date().toISOString(),
    };
  }
}
