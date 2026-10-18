import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '@vibe/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { DecisionsService } from './decisions.service';
import type { DecisionSummary, DecisionView } from './decision.types';
import { ListDecisionsQueryDto } from './dto/list-decisions-query.dto';

interface PrismaMock {
  project: {
    findUnique: jest.Mock;
  };
  task: {
    findUnique: jest.Mock;
  };
  decision: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
}

const actor: AuthUser = {
  id: 'user-1',
  email: 'admin@example.com',
  name: '管理员',
  roles: ['admin'],
  permissions: ['decision:write'],
};

const createDto = {
  title: '采用 Prisma 作为 ORM',
  context: '需要在 NestJS 中统一数据访问层。',
  options: 'A. Prisma；B. TypeORM。',
  decision: '选择 Prisma，迁移与类型生成更省事。',
};

function makeRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'decision-1',
    projectId: 'project-1',
    taskId: null,
    title: createDto.title,
    context: createDto.context,
    options: createDto.options,
    decision: createDto.decision,
    consequences: null,
    status: 'proposed',
    createdById: 'user-1',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-02T00:00:00.000Z'),
    project: { id: 'project-1', name: '交付控制台' },
    task: null,
    createdBy: { id: 'user-1', name: '管理员' },
    ...overrides,
  };
}

async function captureError(
  run: () => Promise<unknown>,
): Promise<HttpException> {
  try {
    await run();
  } catch (error) {
    return error as HttpException;
  }

  throw new Error('预期抛出异常，但调用成功');
}

describe('DecisionsService', () => {
  let prisma: PrismaMock;
  let service: DecisionsService;

  beforeEach(() => {
    prisma = {
      project: { findUnique: jest.fn() },
      task: { findUnique: jest.fn() },
      decision: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    service = new DecisionsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('项目不存在时返回 404', async () => {
      prisma.project.findUnique.mockResolvedValue(null);

      const error = await captureError(() =>
        service.create('project-1', createDto, actor),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ message: '项目不存在' });
      expect(prisma.decision.create).not.toHaveBeenCalled();
    });

    it('关联任务不属于该项目时返回 400 且不写入', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'project-1' });
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        projectId: 'project-2',
      });

      const error = await captureError(() =>
        service.create(
          'project-1',
          { ...createDto, taskId: 'task-1' },
          actor,
        ),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        message: '关联任务不存在或不属于该项目',
      });
      expect(prisma.decision.create).not.toHaveBeenCalled();
    });

    it('关联任务属于同一项目时写入并返回视图', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'project-1' });
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        projectId: 'project-1',
      });
      prisma.decision.create.mockResolvedValue(
        makeRow({
          taskId: 'task-1',
          task: { id: 'task-1', title: '实现登录' },
        }),
      );

      const view = await service.create(
        'project-1',
        { ...createDto, taskId: 'task-1' },
        actor,
      );

      expect(prisma.decision.create).toHaveBeenCalledWith({
        data: {
          projectId: 'project-1',
          taskId: 'task-1',
          title: createDto.title,
          context: createDto.context,
          options: createDto.options,
          decision: createDto.decision,
          consequences: null,
          status: 'proposed',
          createdById: 'user-1',
        },
        include: expect.anything(),
      });
      expect(view).toEqual<DecisionView>({
        id: 'decision-1',
        projectId: 'project-1',
        taskId: 'task-1',
        title: createDto.title,
        context: createDto.context,
        options: createDto.options,
        decision: createDto.decision,
        consequences: null,
        status: 'proposed',
        project: { id: 'project-1', name: '交付控制台' },
        task: { id: 'task-1', title: '实现登录' },
        createdBy: { id: 'user-1', name: '管理员' },
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        updatedAt: new Date('2026-10-02T00:00:00.000Z'),
      });
    });

    it('不传 taskId 时不查询任务，taskId 落为 null', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'project-1' });
      prisma.decision.create.mockResolvedValue(makeRow());

      await service.create('project-1', createDto, actor);

      expect(prisma.task.findUnique).not.toHaveBeenCalled();
      expect(prisma.decision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taskId: null }),
        }),
      );
    });

    it('taskId 为空串或纯空白时落为 null，且不会把空串传给 Prisma', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'project-1' });
      prisma.decision.create.mockResolvedValue(makeRow());

      await service.create('project-1', { ...createDto, taskId: '' }, actor);
      await service.create('project-1', { ...createDto, taskId: '   ' }, actor);

      expect(prisma.task.findUnique).not.toHaveBeenCalled();
      for (const call of prisma.decision.create.mock.calls) {
        expect(call[0].data.taskId).toBeNull();
      }
      expect(prisma.decision.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('list', () => {
    it('按传入的筛选条件查询并按更新时间倒序，默认取 100 条', async () => {
      const rows = [makeRow(), makeRow({ id: 'decision-2' })];
      prisma.decision.findMany.mockResolvedValue(rows);

      const result = await service.list({
        projectId: 'project-1',
        taskId: 'task-1',
        status: 'accepted',
      });

      expect(prisma.decision.findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'project-1',
          taskId: 'task-1',
          status: 'accepted',
        },
        select: expect.anything(),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      expect(result).toHaveLength(2);
    });

    it('只返回摘要字段，不包含正文列', async () => {
      prisma.decision.findMany.mockResolvedValue([makeRow()]);

      const [summary] = await service.list({});

      expect(summary).toEqual<DecisionSummary>({
        id: 'decision-1',
        projectId: 'project-1',
        taskId: null,
        title: createDto.title,
        status: 'proposed',
        project: { id: 'project-1', name: '交付控制台' },
        task: null,
        createdBy: { id: 'user-1', name: '管理员' },
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        updatedAt: new Date('2026-10-02T00:00:00.000Z'),
      });
      expect(summary).not.toHaveProperty('context');
      expect(summary).not.toHaveProperty('options');
      expect(summary).not.toHaveProperty('decision');
      expect(summary).not.toHaveProperty('consequences');
    });

    it('没有筛选条件时不带 where 条件', async () => {
      await service.list({});

      expect(prisma.decision.findMany).toHaveBeenCalledWith({
        where: {},
        select: expect.anything(),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
    });

    it('传入 limit 时按显式数量截取', async () => {
      await service.list({ limit: 200 });

      expect(prisma.decision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('limit 把查询串转成数字并限制在 1 到 200', async () => {
      const valid = plainToInstance(ListDecisionsQueryDto, { limit: '200' });
      expect(await validate(valid)).toHaveLength(0);
      expect(valid.limit).toBe(200);

      const tooLarge = plainToInstance(ListDecisionsQueryDto, { limit: '201' });
      expect(await validate(tooLarge)).not.toHaveLength(0);

      const tooSmall = plainToInstance(ListDecisionsQueryDto, { limit: '0' });
      expect(await validate(tooSmall)).not.toHaveLength(0);
    });
  });

  describe('getDetail', () => {
    it('记录不存在时返回 404', async () => {
      prisma.decision.findUnique.mockResolvedValue(null);

      const error = await captureError(() =>
        service.getDetail('missing'),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({
        message: '决策记录不存在',
      });
    });
  });

  describe('update', () => {
    it('显式传 taskId: null 时解除关联，传 consequences: null 时清空', async () => {
      prisma.decision.findUnique
        .mockResolvedValueOnce({ id: 'decision-1', projectId: 'project-1' })
        .mockResolvedValueOnce(makeRow());
      prisma.decision.updateMany.mockResolvedValue({ count: 1 });

      const view = await service.update('decision-1', {
        taskId: null,
        consequences: null,
      });

      expect(prisma.task.findUnique).not.toHaveBeenCalled();
      expect(prisma.decision.updateMany).toHaveBeenCalledWith({
        where: { id: 'decision-1' },
        data: { taskId: null, consequences: null },
      });
      expect(view.taskId).toBeNull();
      expect(view.consequences).toBeNull();
    });

    it('undefined 字段保持原值，不写入更新数据', async () => {
      prisma.decision.findUnique
        .mockResolvedValueOnce({ id: 'decision-1', projectId: 'project-1' })
        .mockResolvedValueOnce(makeRow({ title: '新的标题' }));
      prisma.decision.updateMany.mockResolvedValue({ count: 1 });

      await service.update('decision-1', { title: '新的标题' });

      expect(prisma.decision.updateMany).toHaveBeenCalledWith({
        where: { id: 'decision-1' },
        data: { title: '新的标题' },
      });
    });

    it('taskId 为空串时归一为 null，不会把空串传给 Prisma', async () => {
      prisma.decision.findUnique
        .mockResolvedValueOnce({ id: 'decision-1', projectId: 'project-1' })
        .mockResolvedValueOnce(makeRow());
      prisma.decision.updateMany.mockResolvedValue({ count: 1 });

      const view = await service.update('decision-1', { taskId: '' });

      expect(prisma.task.findUnique).not.toHaveBeenCalled();
      expect(prisma.decision.updateMany).toHaveBeenCalledWith({
        where: { id: 'decision-1' },
        data: { taskId: null },
      });
      expect(view.taskId).toBeNull();
    });

    it('改成其他项目的任务时返回 400 且不更新', async () => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'decision-1',
        projectId: 'project-1',
      });
      prisma.task.findUnique.mockResolvedValue({
        id: 'task-9',
        projectId: 'project-2',
      });

      const error = await captureError(() =>
        service.update('decision-1', { taskId: 'task-9' }),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getStatus()).toBe(400);
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
    });

    it('记录不存在时返回 404', async () => {
      prisma.decision.findUnique.mockResolvedValue(null);

      const error = await captureError(() =>
        service.update('missing', { title: '新标题' }),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(prisma.decision.updateMany).not.toHaveBeenCalled();
    });

    it('并发删除导致 updateMany 命中 0 条时返回 404', async () => {
      prisma.decision.findUnique.mockResolvedValue({
        id: 'decision-1',
        projectId: 'project-1',
      });
      prisma.decision.updateMany.mockResolvedValue({ count: 0 });

      const error = await captureError(() =>
        service.update('decision-1', { title: '新标题' }),
      );

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      // 条件写未命中后不再回查详情
      expect(prisma.decision.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('删除条数为 0 时返回 404', async () => {
      prisma.decision.deleteMany.mockResolvedValue({ count: 0 });

      const error = await captureError(() => service.remove('missing'));

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({
        message: '决策记录不存在',
      });
    });

    it('删除成功时不抛错', async () => {
      prisma.decision.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.remove('decision-1')).resolves.toBeUndefined();
      expect(prisma.decision.deleteMany).toHaveBeenCalledWith({
        where: { id: 'decision-1' },
      });
    });
  });
});
