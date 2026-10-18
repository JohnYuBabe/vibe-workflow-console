import type { TaskStatus } from '@vibe/shared';
import { api } from './client';

/** 看板 / 阻塞列表里使用的项目精简信息 */
export interface DashboardProjectRef {
  id: string;
  name: string;
}

/** 阻塞列表里的任务引用 */
export interface DashboardTaskRef {
  id: string;
  title: string;
  project: DashboardProjectRef;
}

/** 全局计数，dashboard/summary 已经聚合好，前端直接展示 */
export interface DashboardTotals {
  projects: number;
  tasks: number;
  decisions: number;
  aiSessions: number;
}

/** 五种任务状态都一定存在，后端保证缺失的键补 0 */
export type DashboardStatusCounts = Record<TaskStatus, number>;

export interface DashboardVerification {
  total: number;
  passed: number;
  failed: number;
  /** passed / total；总数为 0 时为 null */
  passRate: number | null;
}

/** 三类阻塞任务，规则由后端按共享门禁策略计算 */
export interface DashboardBlocked {
  spec: DashboardTaskRef[];
  verification: DashboardTaskRef[];
  traceability: DashboardTaskRef[];
}

export interface DashboardSummary {
  generatedAt: string;
  totals: DashboardTotals;
  statusCounts: DashboardStatusCounts;
  verification: DashboardVerification;
  blocked: DashboardBlocked;
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/dashboard/summary');
  return data;
}
