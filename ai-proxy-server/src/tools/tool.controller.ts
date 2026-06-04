import { Controller, Get } from '@nestjs/common';
import { ToolRegistryService } from './tool-registry.service';

@Controller('api/tools')
export class ToolController {
  constructor(private readonly toolRegistry: ToolRegistryService) {}

  @Get()
  listTools() {
    // 前端只读取后端已启用的工具定义；工具执行仍只能由后端流式编排触发。
    return {
      tools: this.toolRegistry.listTools(),
    };
  }
}
