import type { TaskStatus } from '@vibe/shared';
import type { UserRef } from '../common/types';
import type { TaskSummary } from '../tasks/task.types';

/** 项目列表项 */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  owner: UserRef;
  taskCount: number;
  statusCounts: Record<TaskStatus, number>;
  createdAt: Date;
}

/** 项目详情，tasks 为任务摘要列表 */
export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  owner: UserRef;
  tasks: TaskSummary[];
  createdAt: Date;
}
