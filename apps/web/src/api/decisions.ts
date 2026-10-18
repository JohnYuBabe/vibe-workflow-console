import { api } from './client';

/** 与后端 Prisma 的 DecisionStatus 枚举一致 */
export type DecisionStatus = 'proposed' | 'accepted' | 'superseded';

export const DECISION_STATUSES: DecisionStatus[] = [
  'proposed',
  'accepted',
  'superseded',
];

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  proposed: '待定',
  accepted: '已采纳',
  superseded: '已废弃',
};

export type DecisionTagType =
  | 'primary'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger';

const DECISION_STATUS_TAG_TYPES: Record<DecisionStatus, DecisionTagType> = {
  proposed: 'warning',
  accepted: 'success',
  superseded: 'info',
};

export function decisionStatusTagType(status: DecisionStatus): DecisionTagType {
  return DECISION_STATUS_TAG_TYPES[status] ?? 'info';
}

export interface DecisionProjectRef {
  id: string;
  name: string;
}

export interface DecisionTaskRef {
  id: string;
  title: string;
}

export interface DecisionAuthorRef {
  id: string;
  name: string;
}

/** 决策记录列表项：列表接口不返回正文，避免一次拉取全部长文本 */
export interface DecisionSummary {
  id: string;
  projectId: string;
  taskId: string | null;
  title: string;
  status: DecisionStatus;
  project: DecisionProjectRef;
  task: DecisionTaskRef | null;
  createdBy: DecisionAuthorRef | null;
  createdAt: string;
  updatedAt: string;
}

/** 决策记录详情：只有单条详情接口才返回正文 */
export interface DecisionDetail extends DecisionSummary {
  context: string;
  options: string;
  decision: string;
  consequences: string | null;
}

export interface DecisionQuery {
  projectId?: string;
  taskId?: string;
  status?: DecisionStatus | '';
}

export interface DecisionInput {
  /** 去空白后 1..200 */
  title: string;
  /** 去空白后 1..5000 */
  context: string;
  /** 去空白后 1..5000 */
  options: string;
  /** 去空白后 1..5000 */
  decision: string;
  /** 最长 5000，空值存 null */
  consequences?: string | null;
  status?: DecisionStatus;
  /** 传 null 表示解除任务关联 */
  taskId?: string | null;
}

export type UpdateDecisionInput = Partial<DecisionInput>;

export async function fetchDecisions(
  query: DecisionQuery = {},
): Promise<DecisionSummary[]> {
  const { data } = await api.get<DecisionSummary[]>('/decisions', {
    params: {
      projectId: query.projectId || undefined,
      taskId: query.taskId || undefined,
      status: query.status || undefined,
    },
  });
  return data;
}

export async function fetchDecision(id: string): Promise<DecisionDetail> {
  const { data } = await api.get<DecisionDetail>(`/decisions/${id}`);
  return data;
}

export async function createDecision(
  projectId: string,
  payload: DecisionInput,
): Promise<DecisionDetail> {
  const { data } = await api.post<DecisionDetail>(
    `/projects/${projectId}/decisions`,
    payload,
  );
  return data;
}

export async function updateDecision(
  id: string,
  payload: UpdateDecisionInput,
): Promise<DecisionDetail> {
  const { data } = await api.patch<DecisionDetail>(
    `/decisions/${id}`,
    payload,
  );
  return data;
}

export async function removeDecision(id: string): Promise<void> {
  await api.delete(`/decisions/${id}`);
}
