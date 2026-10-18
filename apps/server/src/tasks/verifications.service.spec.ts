import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';
import { VerificationsService } from './verifications.service';

interface PrismaMock {
  task: { findUnique: jest.Mock };
  verification: {
    create: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  $queryRawUnsafe: jest.Mock;
  $transaction: jest.Mock;
}

const actor: AuthUser = {
  id: 'user-1',
  email: 'admin@example.com',
  name: '管理员',
  roles: ['admin'],
  permissions: ['task:write'],
};

async function captureError(
  run: () => Promise<unknown>,
): Promise<{ error: unknown }> {
  try {
    await run();
  } catch (error) {
    return { error };
  }

  throw new Error('预期抛出异常，但调用成功');
}

describe('VerificationsService', () => {
  let prisma: PrismaMock;
  let service: VerificationsService;

  beforeEach(() => {
    prisma = {
      task: { findUnique: jest.fn() },
      verification: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn(
        async (callback: (tx: PrismaMock) => Promise<unknown>) =>
          callback(prisma),
      ),
    };

    service = new VerificationsService(prisma as unknown as PrismaService);
  });

  it('done 任务不能新增验证记录', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'done' }]);

    const { error } = await captureError(() =>
      service.create(
        'task-1',
        { command: 'pnpm test', result: 'passed' },
        actor,
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      message: '已完成的任务不可修改规格或证据',
      code: 'TASK_IMMUTABLE',
    });
    expect(prisma.verification.create).not.toHaveBeenCalled();
  });

  it('done 任务不能删除验证记录', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'done' }]);

    const { error } = await captureError(() =>
      service.remove('task-1', 'verification-1'),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'TASK_IMMUTABLE',
    });
    expect(prisma.verification.deleteMany).not.toHaveBeenCalled();
  });

  it('任务不存在时删除返回 404', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([]);

    const { error } = await captureError(() =>
      service.remove('missing', 'verification-1'),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getStatus()).toBe(404);
    expect(prisma.verification.deleteMany).not.toHaveBeenCalled();
  });

  it('未完成任务可以删除验证记录', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'in_progress' }]);
    prisma.verification.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.remove('task-1', 'verification-1'),
    ).resolves.toBeUndefined();

    expect(prisma.verification.deleteMany).toHaveBeenCalledWith({
      where: { id: 'verification-1', taskId: 'task-1' },
    });
  });

  it('记录不存在或不属于该任务时返回 404', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'review' }]);
    prisma.verification.deleteMany.mockResolvedValue({ count: 0 });

    const { error } = await captureError(() =>
      service.remove('task-1', 'verification-1'),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      message: '验证记录不存在',
    });
  });
});
