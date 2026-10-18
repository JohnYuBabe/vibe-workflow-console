import type { TaskStatus } from '@vibe/shared';

/** 阻塞列表中引用的任务，连同所属项目，便于直接跳转 */
export interface TaskRef {
  id: string;
  title: string;
  project: { id: string; name: string };
}

/** 仪表盘顶部的四个总量指标 */
export interface DashboardTotals {
  projects: number;
  tasks: number;
  decisions: number;
  aiSessions: number;
}

/** 验证记录汇总；没有验证记录时通过率为 null，避免除零 */
export interface DashboardVerificationSummary {
  total: number;
  passed: number;
  failed: number;
  /** passed / total，0..1；total 为 0 时为 null */
  passRate: number | null;
}

/** 按门禁类型分组的阻塞任务 */
export interface DashboardBlocked {
  spec: TaskRef[];
  verification: TaskRef[];
  traceability: TaskRef[];
}

/**
 * GET /dashboard/summary 的响应。
 * statusCounts 始终包含全部五个状态，没有任务的状态为 0。
 */
export interface DashboardSummary {
  generatedAt: Date;
  totals: DashboardTotals;
  statusCounts: Record<TaskStatus, number>;
  verification: DashboardVerificationSummary;
  blocked: DashboardBlocked;
}
