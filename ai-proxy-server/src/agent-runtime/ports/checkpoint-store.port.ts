import type { AgentRunContext, AgentRunState } from '../agent-runtime.types';

export const CHECKPOINT_STORE = 'CHECKPOINT_STORE';

export interface CheckpointStorePort {
  putStepStarted(ctx: AgentRunContext, stepName: string, state: AgentRunState): Promise<void>;
  putStepCompleted(ctx: AgentRunContext, stepName: string, state: AgentRunState): Promise<void>;
  putStepFailed(ctx: AgentRunContext, stepName: string, error: unknown, state: AgentRunState): Promise<void>;
}

export class NoopCheckpointStore implements CheckpointStorePort {
  async putStepStarted(): Promise<void> {}
  async putStepCompleted(): Promise<void> {}
  async putStepFailed(): Promise<void> {}
}
