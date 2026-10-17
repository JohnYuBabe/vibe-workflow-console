import type { AvailableTransition, TaskStatus } from '@vibe/shared';
import { api } from './client';

/** 任务所属项目的精简信息 */
export interface TaskProjectRef {
  id: string;
  name: string;
}

/** 验收标准（后端 PUT /tasks/:id/criteria 之后的返回结构） */
export interface AcceptanceCriterion {
  id: string;
  content: string;
  position: number;
}

/** 一条状态流转记录 */
export interface TaskTransitionRecord {
  id: string;
  /** 创建任务时可能没有来源状态 */
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  actor: {
    id: string;
    name: string;
  };
  note: string | null;
  createdAt: string;
}

/** 服务端计算好的门禁快照，前端只负责展示 */
export interface TaskGate {
  specLength: number;
  criteriaCount: number;
  specOk: boolean;
  criteriaOk: boolean;
}

/** 任务列表项 */
export interface TaskSummary {
  id: string;
  projectId?: string;
  project?: TaskProjectRef;
  title: string;
  status: TaskStatus;
  criteria?: AcceptanceCriterion[];
  /** 后端可能直接下发验收条数 */
  criteriaCount?: number;
  /** 后端也可能用 Prisma 的 _count 下发 */
  _count?: {
    criteria?: number;
  };
  createdAt?: string;
  updatedAt: string;
}

/** 任务详情，字段与 docs / API 契约一致 */
export interface TaskDetail {
  id: string;
  project: TaskProjectRef;
  title: string;
  spec: string | null;
  manualNote: string | null;
  status: TaskStatus;
  criteria: AcceptanceCriterion[];
  transitions: TaskTransitionRecord[];
  /** 服务端按共享策略算好的候选流转，前端不自行判断门禁 */
  availableTransitions: AvailableTransition[];
  gate: TaskGate;
  createdAt: string;
  updatedAt: string;
}

export interface TaskQuery {
  projectId?: string;
  status?: TaskStatus | '';
}

export interface CreateTaskInput {
  title: string;
  spec?: string;
  /** 逐行输入的验收标准，空行由前端过滤 */
  acceptanceCriteria?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  spec?: string | null;
  manualNote?: string | null;
}

export interface TransitionInput {
  to: TaskStatus;
  note?: string;
}

export async function fetchTasks(query: TaskQuery = {}): Promise<TaskSummary[]> {
  const { data } = await api.get<TaskSummary[]>('/tasks', {
    params: {
      projectId: query.projectId || undefined,
      status: query.status || undefined,
    },
  });
  return data;
}

export async function fetchTask(id: string): Promise<TaskDetail> {
  const { data } = await api.get<TaskDetail>(`/tasks/${id}`);
  return data;
}

export async function createTask(
  projectId: string,
  payload: CreateTaskInput,
): Promise<TaskDetail> {
  const { data } = await api.post<TaskDetail>(
    `/projects/${projectId}/tasks`,
    payload,
  );
  return data;
}

export async function updateTask(
  id: string,
  payload: UpdateTaskInput,
): Promise<TaskDetail> {
  const { data } = await api.patch<TaskDetail>(`/tasks/${id}`, payload);
  return data;
}

/**
 * 整体替换验收标准。
 * 后端以 items 列表为准，重新生成 id 与 position。
 */
export async function replaceCriteria(
  id: string,
  criteria: string[],
): Promise<TaskDetail> {
  const { data } = await api.put<TaskDetail>(`/tasks/${id}/criteria`, {
    items: criteria,
  });
  return data;
}

export async function transitionTask(
  id: string,
  payload: TransitionInput,
): Promise<TaskDetail> {
  const { data } = await api.post<TaskDetail>(
    `/tasks/${id}/transitions`,
    payload,
  );
  return data;
}

/** 只关心计数字段的宽松入参，表格行等局部类型也能直接传进来 */
export interface CriteriaCountSource {
  criteriaCount?: number;
  criteria?: unknown;
  _count?: {
    criteria?: number;
  };
}

/**
 * 列表接口可能返回 criteria 数组、criteriaCount 或 Prisma 的 _count，
 * 这里统一取出验收条数，避免页面各写一套。
 */
export function criteriaCountOf(task: CriteriaCountSource): number {
  if (typeof task.criteriaCount === 'number') {
    return task.criteriaCount;
  }
  if (Array.isArray(task.criteria)) {
    return task.criteria.length;
  }
  return task._count?.criteria ?? 0;
}
