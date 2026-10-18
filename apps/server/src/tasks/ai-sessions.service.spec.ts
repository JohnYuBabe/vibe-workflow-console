import { ConflictException } from '@nestjs/common';
import type { AuthUser } from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AiSessionsService } from './ai-sessions.service';

interface PrismaMock {
  task: { findUnique: jest.Mock };
  aiSession: {
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

describe('AiSessionsService', () => {
  let prisma: PrismaMock;
  let service: AiSessionsService;

  beforeEach(() => {
    prisma = {
      task: { findUnique: jest.fn() },
      aiSession: {
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

    service = new AiSessionsService(prisma as unknown as PrismaService);
  });

  it('done 任务不能新增 AI 会话', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'done' }]);

    const { error } = await captureError(() =>
      service.create('task-1', { title: '调试记录' }, actor),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'TASK_IMMUTABLE',
    });
    expect(prisma.aiSession.create).not.toHaveBeenCalled();
  });

  it('done 任务不能删除 AI 会话', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'done' }]);

    const { error } = await captureError(() =>
      service.remove('task-1', 'session-1'),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'TASK_IMMUTABLE',
    });
    expect(prisma.aiSession.deleteMany).not.toHaveBeenCalled();
  });
});
