import { Module } from '@nestjs/common';
import { FileModule } from '@/files/file.module';
import { BuiltinToolAdapter } from './adapters/builtin-tool.adapter';
import { CustomToolAdapter } from './adapters/custom-tool.adapter';
import { McpToolAdapter } from './adapters/mcp-tool.adapter';
import { ToolExecutorService } from './tool-executor.service';
import { ToolRegistryService } from './tool-registry.service';
import { ToolController } from './tool.controller';

@Module({
  imports: [FileModule],
  controllers: [ToolController],
  providers: [
    BuiltinToolAdapter,
    CustomToolAdapter,
    McpToolAdapter,
    ToolRegistryService,
    ToolExecutorService,
  ],
  exports: [ToolRegistryService, ToolExecutorService],
})
export class ToolModule {}
