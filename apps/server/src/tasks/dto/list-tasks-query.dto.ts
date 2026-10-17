import { IsIn, IsOptional, IsString } from 'class-validator';
import type { TaskStatus } from '@vibe/shared';
import { TASK_STATUSES } from '@vibe/shared';

export class ListTasksQueryDto {
  @IsOptional()
  @IsString({ message: '项目 ID 格式不正确' })
  projectId?: string;

  @IsOptional()
  @IsIn(TASK_STATUSES, { message: '无效的任务状态' })
  status?: TaskStatus;
}
