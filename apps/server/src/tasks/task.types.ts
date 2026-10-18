import type {
  AvailableTransition,
  CompletionGateSummary,
  SpecGateSummary,
  TaskStatus,
} from '@vibe/shared';
import type { UserRef } from '../common/types';

/** 验证结论；与 Prisma 的 VerificationResult 枚举取值一致 */
export type VerificationResultValue = 'passed' | 'failed';

/** 任务列表项 */
export interface TaskSummary {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  criteriaCount: number;
  updatedAt: Date;
}

export interface TaskCriterion {
  id: string;
  content: string;
  position: number;
}

export interface TaskTransitionView {
  id: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  actor: UserRef;
  note: string | null;
  createdAt: Date;
}

/** 验证记录；createdBy 只暴露 id 与 name */
export interface VerificationView {
  id: string;
  taskId: string;
  command: string;
  result: VerificationResultValue;
  evidenceUrl: string | null;
  note: string | null;
  createdBy: UserRef | null;
  createdAt: Date;
}

/** AI 会话记录；createdBy 只暴露 id 与 name */
export interface AiSessionView {
  id: string;
  taskId: string;
  title: string;
  tool: string | null;
  summary: string | null;
  createdBy: UserRef | null;
  createdAt: Date;
}

/**
 * 详情接口的门禁摘要。
 * 规格部分来自 summarizeSpecGate，完成部分来自 summarizeCompletionGate，
 * 与 evaluateTransition 使用同一份计数口径。
 */
export type TaskGate = SpecGateSummary & CompletionGateSummary;

/** 任务详情，包含门禁判断与可选流转 */
export interface TaskDetail {
  id: string;
  project: { id: string; name: string };
  title: string;
  spec: string | null;
  manualNote: string | null;
  status: TaskStatus;
  criteria: TaskCriterion[];
  transitions: TaskTransitionView[];
  verifications: VerificationView[];
  aiSessions: AiSessionView[];
  availableTransitions: AvailableTransition[];
  gate: TaskGate;
  createdAt: Date;
  updatedAt: Date;
}
