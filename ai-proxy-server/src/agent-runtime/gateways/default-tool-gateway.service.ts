import { Injectable } from '@nestjs/common';
import { ToolExecutorService } from '@/tools/tool-executor.service';
import { ToolRegistryService } from '@/tools/tool-registry.service';
import type {
  ToolDefinition,
  ToolDefinitionRef,
  ToolExecutionRequest,
  ToolExecutionResult,
} from '@/tools/dto/tool-definition.dto';
import type { ToolGatewayPort } from '../ports/tool-gateway.port';

@Injectable()
export class DefaultToolGatewayService implements ToolGatewayPort {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly toolExecutor: ToolExecutorService,
  ) {}

  resolveRequestedTools(refs: ToolDefinitionRef[]): ToolDefinition[] {
    return this.toolRegistry.resolveRequestedTools(refs);
  }

  findByName(name: string): ToolDefinition | undefined {
    return this.toolRegistry.findByName(name);
  }

  execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    return this.toolExecutor.execute(request);
  }
}
