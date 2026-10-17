import type { AvailableTransition, TaskStatus } from '@vibe/shared';
import type { UserRef } from '../common/types';

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

export interface TaskGate {
  specLength: number;
  criteriaCount: number;
  specOk: boolean;
  criteriaOk: boolean;
}

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
  availableTransitions: AvailableTransition[];
  gate: TaskGate;
  createdAt: Date;
  updatedAt: Date;
}
