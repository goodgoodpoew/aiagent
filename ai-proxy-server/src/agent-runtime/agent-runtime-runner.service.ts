import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type {
  AgentRunContext,
  AgentRunState,
  AgentRuntimeEmit,
  AgentStep,
} from './agent-runtime.types';
import {
  CHECKPOINT_STORE,
  NoopCheckpointStore,
  type CheckpointStorePort,
} from './ports/checkpoint-store.port';

@Injectable()
export class AgentRuntimeRunner {
  private readonly logger = new Logger(AgentRuntimeRunner.name);
  private readonly fallbackCheckpointStore = new NoopCheckpointStore();

  constructor(
    @Optional()
    @Inject(CHECKPOINT_STORE)
    private readonly checkpointStore?: CheckpointStorePort,
  ) {}

  async run(
    steps: AgentStep[],
    ctx: AgentRunContext,
    state: AgentRunState,
    emit: AgentRuntimeEmit,
  ): Promise<void> {
    const store = this.checkpointStore ?? this.fallbackCheckpointStore;

    for (const step of steps) {
      if (state.stopped) return;

      state.failureStage = step.stage;
      await store.putStepStarted(ctx, step.name, state);

      try {
        await step.execute(ctx, state, emit);
        await store.putStepCompleted(ctx, step.name, state);
      } catch (error) {
        await store.putStepFailed(ctx, step.name, error, state);
        this.logger.warn(
          `Agent step 执行失败: ${step.name}, stage=${step.stage}`,
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    }
  }
}
