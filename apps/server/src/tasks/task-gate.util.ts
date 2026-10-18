import type { TaskGateInput } from '@vibe/shared';
import {
  summarizeCompletionGate,
  summarizeSpecGate,
} from '@vibe/shared';
import type { TaskGate } from './task.types';

/** 门禁判断所需的任务字段 */
export interface GateSource {
  spec: string | null;
  manualNote: string | null;
  criteria: Array<{ content: string }>;
  verifications: Array<{ result: string }>;
  aiSessions: Array<{ id: string }>;
}

/**
 * 组装共享策略 evaluateTransition / availableTransitions 的输入。
 * 通过验证数与会话数从真实记录统计，门禁规则本身仍只在 @vibe/shared 里。
 */
export function buildGateInput(task: GateSource): TaskGateInput {
  return {
    spec: task.spec,
    acceptanceCriteria: task.criteria.map((criterion) => criterion.content),
    passedVerifications: task.verifications.filter(
      (verification) => verification.result === 'passed',
    ).length,
    aiSessionCount: task.aiSessions.length,
    manualNote: task.manualNote,
  };
}

/** 详情接口展示用的门禁摘要；计数与阈值直接取共享策略，不在这里重算 */
export function summarizeGate(input: TaskGateInput): TaskGate {
  return {
    ...summarizeSpecGate(input),
    ...summarizeCompletionGate(input),
  };
}
