import type { UserRef } from '../common/types';

/** 决策状态；与 Prisma 的 DecisionStatus 枚举取值一致 */
export const DECISION_STATUSES = [
  'proposed',
  'accepted',
  'superseded',
] as const;

export type DecisionStatusValue = (typeof DECISION_STATUSES)[number];

/** 决策记录列表项；project/task/createdBy 只暴露最小字段，正文列不参与列表查询 */
export interface DecisionSummary {
  id: string;
  projectId: string;
  taskId: string | null;
  title: string;
  status: DecisionStatusValue;
  project: { id: string; name: string };
  task: { id: string; title: string } | null;
  createdBy: UserRef | null;
  createdAt: Date;
  updatedAt: Date;
}

/** 决策记录详情，在列表项基础上附带完整正文 */
export interface DecisionView extends DecisionSummary {
  context: string;
  options: string;
  decision: string;
  consequences: string | null;
}
