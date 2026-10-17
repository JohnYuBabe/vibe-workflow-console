import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { TaskStatus } from '@vibe/shared';
import { TASK_STATUSES } from '@vibe/shared';

export class TransitionTaskDto {
  @IsIn(TASK_STATUSES, { message: '无效的任务状态' })
  to!: TaskStatus;

  @IsOptional()
  @IsString({ message: '流转备注格式不正确' })
  @MaxLength(500, { message: '流转备注最多 500 字' })
  note?: string;
}
