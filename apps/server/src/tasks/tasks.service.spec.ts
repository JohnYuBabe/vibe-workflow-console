import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TaskDetail } from './task.types';
import { TasksService } from './tasks.service';

interface PrismaMock {
  task: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
  acceptanceCriterion: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
  $queryRawUnsafe: jest.Mock;
  $transaction: jest.Mock;
}

const detail = { id: 'task-1', status: 'draft' } as unknown as TaskDetail;

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

describe('TasksService', () => {
  let prisma: PrismaMock;
  let service: TasksService;

  beforeEach(() => {
    prisma = {
      task: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      acceptanceCriterion: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
      $transaction: jest.fn(
        async (callback: (tx: PrismaMock) => Promise<unknown>) =>
          callback(prisma),
      ),
    };

    service = new TasksService(prisma as unknown as PrismaService);
    jest.spyOn(service, 'getDetail').mockResolvedValue(detail);
  });

  it('列表查询带 project 并返回所属项目', async () => {
    const updatedAt = new Date();
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task-1',
        projectId: 'project-1',
        title: '实现登录',
        status: 'draft',
        updatedAt,
        project: { id: 'project-1', name: '控制台' },
        _count: { criteria: 3 },
      },
    ]);

    await expect(service.list({})).resolves.toEqual([
      {
        id: 'task-1',
        projectId: 'project-1',
        project: { id: 'project-1', name: '控制台' },
        title: '实现登录',
        status: 'draft',
        criteriaCount: 3,
        updatedAt,
      },
    ]);

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          _count: { select: { criteria: true } },
          project: { select: { id: true, name: true } },
        },
      }),
    );
  });

  it('删除任务命中时按 id 删除', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'draft' }]);
    prisma.task.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove('task-1')).resolves.toBeUndefined();

    expect(prisma.task.deleteMany).toHaveBeenCalledWith({
      where: { id: 'task-1' },
    });
  });

  it('删除不存在的任务返回 404', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([]);

    const { error } = await captureError(() => service.remove('missing'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getStatus()).toBe(404);
    expect((error as NotFoundException).getResponse()).toEqual({
      message: '任务不存在',
      error: 'Not Found',
      statusCode: 404,
    });
    expect(prisma.task.deleteMany).not.toHaveBeenCalled();
  });

  it('done 任务不能删除', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'done' }]);

    const { error } = await captureError(() => service.remove('task-1'));

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'TASK_IMMUTABLE',
    });
    expect(prisma.task.deleteMany).not.toHaveBeenCalled();
  });

  it('done 任务不能修改标题、规格与人工记录', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'done' }]);

    const { error } = await captureError(() =>
      service.update('task-1', { title: '新标题', spec: '新规格' }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toEqual({
      message: '已完成的任务不可修改规格或证据',
      code: 'TASK_IMMUTABLE',
      reasons: ['已完成的任务不可修改规格或证据'],
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('done 任务不能重写验收标准', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'done' }]);

    const { error } = await captureError(() =>
      service.replaceCriteria('task-1', { items: ['新的验收标准'] }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'TASK_IMMUTABLE',
    });
    expect(prisma.acceptanceCriterion.deleteMany).not.toHaveBeenCalled();
  });

  it('draft 任务仍可更新', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ status: 'draft' }]);
    prisma.task.update.mockResolvedValue({});

    await expect(
      service.update('task-1', { title: '新标题' }),
    ).resolves.toBe(detail);

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { title: '新标题' },
    });
  });
});
