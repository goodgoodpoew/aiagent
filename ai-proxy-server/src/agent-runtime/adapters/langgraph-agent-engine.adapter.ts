import { Injectable } from '@nestjs/common';
import type { AgentRuntimeEvent, AgentRuntimeInput } from '../agent-runtime.types';
import type { AgentEnginePort } from '../ports/agent-engine.port';

@Injectable()
export class LangGraphAgentEngineAdapter implements AgentEnginePort {
  async *run(_input: AgentRuntimeInput): AsyncIterable<AgentRuntimeEvent> {
    throw new Error('LangGraphAgentEngineAdapter 尚未启用：当前生产默认使用 native agent runtime');
  }
}
