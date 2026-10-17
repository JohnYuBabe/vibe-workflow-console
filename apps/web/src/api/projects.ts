import { TASK_STATUSES, type TaskStatus } from '@vibe/shared';
import { api } from './client';
import type { TaskSummary } from './tasks';

export interface ProjectOwner {
  id: string;
  name: string;
}

/** 项目列表 / 详情共用的接口结构 */
export interface Project {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  ownerId?: string;
  owner?: ProjectOwner | null;
  /** 后端直接下发的任务总数 */
  taskCount?: number;
  /** 后端直接下发的各状态计数 */
  statusCounts?: Partial<Record<TaskStatus, number>>;
  /** 兼容另一种聚合字段命名 */
  counts?: Partial<Record<TaskStatus, number>>;
  /** 兼容 Prisma _count */
  _count?: {
    tasks?: number;
  };
  /** 部分接口会直接带上任务列表 */
  tasks?: TaskSummary[];
  createdAt: string;
  /** 列表与详情接口目前只返回 createdAt */
  updatedAt?: string;
}

export type ProjectDetail = Project;

export interface ProjectInput {
  name: string;
  description?: string | null;
  repoUrl?: string | null;
}

export async function fetchProjects(): Promise<Project[]> {
  const { data } = await api.get<Project[]>('/projects');
  return data;
}

export async function fetchProject(id: string): Promise<ProjectDetail> {
  const { data } = await api.get<ProjectDetail>(`/projects/${id}`);
  return data;
}

export async function createProject(
  payload: ProjectInput,
): Promise<ProjectDetail> {
  const { data } = await api.post<ProjectDetail>('/projects', payload);
  return data;
}

export async function updateProject(
  id: string,
  payload: Partial<ProjectInput>,
): Promise<ProjectDetail> {
  const { data } = await api.patch<ProjectDetail>(`/projects/${id}`, payload);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

export function emptyStatusCounts(): Record<TaskStatus, number> {
  return TASK_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<TaskStatus, number>,
  );
}

export function taskCountOf(project: Project): number {
  if (typeof project.taskCount === 'number') {
    return project.taskCount;
  }
  if (typeof project._count?.tasks === 'number') {
    return project._count.tasks;
  }
  return project.tasks?.length ?? 0;
}

/** 把各种计数来源归一成五个状态都有值的对象，页面直接遍历渲染 */
export function statusCountsOf(project: Project): Record<TaskStatus, number> {
  const result = emptyStatusCounts();
  const source = project.statusCounts ?? project.counts;

  if (source) {
    for (const status of TASK_STATUSES) {
      result[status] = source[status] ?? 0;
    }
    return result;
  }

  if (project.tasks) {
    for (const task of project.tasks) {
      result[task.status] += 1;
    }
  }

  return result;
}
