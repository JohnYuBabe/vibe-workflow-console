import type { TaskGateInput } from '@vibe/shared';
import { summarizeSpecGate } from '@vibe/shared';
import type { TaskGate } from './task.types';

/** 门禁判断所需的任务字段 */
export interface GateSource {
  spec: string | null;
  manualNote: string | null;
  criteria: Array<{ content: string }>;
}

/**
 * 组装共享策略 evaluateTransition / availableTransitions 的输入。
 * Day 2 尚无 Verification 与 AiSession 模型，两者恒为 0；
 * 因此 review -> done 永远会被验证门禁拦下。
 */
export function buildGateInput(task: GateSource): TaskGateInput {
  return {
    spec: task.spec,
    acceptanceCriteria: task.criteria.map((criterion) => criterion.content),
    passedVerifications: 0,
    aiSessionCount: 0,
    manualNote: task.manualNote,
  };
}

/** 详情接口展示用的门禁摘要；计数与阈值直接取共享策略，不在这里重算 */
export function summarizeGate(input: TaskGateInput): TaskGate {
  return summarizeSpecGate(input);
}
