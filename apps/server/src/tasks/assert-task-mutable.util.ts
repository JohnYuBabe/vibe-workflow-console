import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export const TASK_IMMUTABLE_MESSAGE = '已完成的任务不可修改规格或证据';

/** 只依赖事务里的行锁查询能力，便于单测替换 */
export type TaskLockDb = Pick<Prisma.TransactionClient, '$queryRawUnsafe'>;

/**
 * done 任务不可变校验。
 *
 * 完成门禁只在流转瞬间判定；若完成后还能删改证据，任务会停在 done
 * 但门禁不再达标。这里用 `SELECT ... FOR UPDATE` 在同一个事务里锁住任务行：
 * 并发的流转请求会先拿到写锁，等本事务提交后才继续，避免「检查完状态、
 * 写入前被流转到 done」的竞态。调用方必须在事务中使用。
 */
export async function assertTaskMutable(
  db: TaskLockDb,
  taskId: string,
): Promise<void> {
  const rows = await db.$queryRawUnsafe<Array<{ status: string }>>(
    'SELECT status FROM tasks WHERE id = ? FOR UPDATE',
    taskId,
  );

  if (rows.length === 0) {
    throw new NotFoundException('任务不存在');
  }

  if (rows[0].status === 'done') {
    throw new ConflictException({
      message: TASK_IMMUTABLE_MESSAGE,
      code: 'TASK_IMMUTABLE',
      reasons: [TASK_IMMUTABLE_MESSAGE],
    });
  }
}
