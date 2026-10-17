import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from '@vibe/shared';

export type StatusTagType =
  | 'primary'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger';

/** 状态对应的标签配色 */
export const TASK_STATUS_TAG_TYPES: Record<TaskStatus, StatusTagType> = {
  draft: 'info',
  ready: 'primary',
  in_progress: 'warning',
  review: 'danger',
  done: 'success',
};

export function statusLabel(status: TaskStatus | null | undefined): string {
  if (!status) {
    return '—';
  }
  return TASK_STATUS_LABELS[status] ?? status;
}

export function statusTagType(status: TaskStatus): StatusTagType {
  return TASK_STATUS_TAG_TYPES[status] ?? 'info';
}

/** 按状态机顺序判断是否为前进方向，用来决定按钮主次样式 */
export function isForwardTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_STATUSES.indexOf(to) > TASK_STATUSES.indexOf(from);
}
