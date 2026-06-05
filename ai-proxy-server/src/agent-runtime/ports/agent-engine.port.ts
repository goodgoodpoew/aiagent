import type { AgentRuntimeEvent, AgentRuntimeInput } from '../agent-runtime.types';

export const AGENT_ENGINE = 'AGENT_ENGINE';

export interface AgentEnginePort {
  run(input: AgentRuntimeInput): AsyncIterable<AgentRuntimeEvent>;
}
