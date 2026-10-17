import {
  ConflictException,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthUser, TaskStatus } from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { TaskDetail } from './task.types';
import { TaskStatusService } from './task-status.service';
import { TasksService } from './tasks.service';

interface PrismaMock {
  task: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  taskTransition: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
}

/** 30 字，超过规格门禁的 20 字下限 */
const LONG_SPEC = '这是一段足够长的任务规格说明。'.repeat(2);
/** 超过 20 字的人工追溯记录 */
const LONG_NOTE =
  '人工记录：本次交付已与 AI 协同完成，包含实现细节和验证过程。';

const actor: AuthUser = {
  id: 'user-1',
  email: 'admin@example.com',
  name: '管理员',
  roles: ['admin'],
  permissions: ['task:write'],
};

const detail = { id: 'task-1', status: 'ready' } as unknown as TaskDetail;

function makeTask(
  overrides: {
    status?: TaskStatus;
    spec?: string | null;
    manualNote?: string | null;
    criteria?: string[];
  } = {},
) {
  const criteria = overrides.criteria ?? ['标准一', '标准二', '标准三'];

  return {
    id: 'task-1',
    projectId: 'project-1',
    title: '实现登录',
    spec: overrides.spec === undefined ? LONG_SPEC : overrides.spec,
    manualNote:
      overrides.manualNote === undefined ? null : overrides.manualNote,
    status: overrides.status ?? 'draft',
    criteria: criteria.map((content, index) => ({
      id: `criterion-${index}`,
      taskId: 'task-1',
      content,
      position: index,
      createdAt: new Date(),
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
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

describe('TaskStatusService', () => {
  let prisma: PrismaMock;
  let tasksService: { getDetail: jest.Mock };
  let service: TaskStatusService;

  beforeEach(() => {
    prisma = {
      task: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      taskTransition: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(
        async (callback: (tx: PrismaMock) => Promise<unknown>) =>
          callback(prisma),
      ),
    };

    tasksService = { getDetail: jest.fn().mockResolvedValue(detail) };

    service = new TaskStatusService(
      prisma as unknown as PrismaService,
      tasksService as unknown as TasksService,
    );
  });

  it('规格不足时返回 422 规格门禁', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ spec: '太短了' }));

    const error = await captureError(() =>
      service.transition('task-1', { to: 'ready' }, actor),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toEqual({
      message: '规格门禁未通过',
      code: 'SPEC_GATE',
      reasons: ['规格至少 20 字，当前 3 字'],
    });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('规格合格但只有 2 条验收标准时返回 422', async () => {
    prisma.task.findUnique.mockResolvedValue(
      makeTask({ criteria: ['标准一', '标准二'] }),
    );

    const error = await captureError(() =>
      service.transition('task-1', { to: 'ready' }, actor),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toEqual({
      message: '规格门禁未通过',
      code: 'SPEC_GATE',
      reasons: ['至少需要 3 条验收标准，当前 2 条'],
    });
  });

  it('规格与验收标准齐全时允许 draft -> ready 并记录流转', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask());

    await expect(
      service.transition(
        'task-1',
        { to: 'ready', note: '规格已补齐' },
        actor,
      ),
    ).resolves.toBe(detail);

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { status: 'ready' },
    });
    expect(prisma.taskTransition.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-1',
        fromStatus: 'draft',
        toStatus: 'ready',
        actorId: 'user-1',
        note: '规格已补齐',
      },
    });
    expect(tasksService.getDetail).toHaveBeenCalledWith('task-1');
  });

  it('review -> done 被验证门禁拦截，无人工记录时同时报追溯缺失', async () => {
    prisma.task.findUnique.mockResolvedValue(
      makeTask({ status: 'review', manualNote: null }),
    );

    const error = await captureError(() =>
      service.transition('task-1', { to: 'done' }, actor),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      message: '没有通过的验证记录，不能标记完成',
      code: 'VERIFICATION_GATE',
      reasons: [
        '没有通过的验证记录，不能标记完成',
        '缺少追溯记录：至少一条 AI 会话，或不少于 20 字的人工记录',
      ],
    });
  });

  it('人工记录满足追溯时，验证缺失仍然拦截完成', async () => {
    prisma.task.findUnique.mockResolvedValue(
      makeTask({ status: 'review', manualNote: LONG_NOTE }),
    );

    const error = await captureError(() =>
      service.transition('task-1', { to: 'done' }, actor),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      message: '没有通过的验证记录，不能标记完成',
      code: 'VERIFICATION_GATE',
      reasons: ['没有通过的验证记录，不能标记完成'],
    });
  });

  it('非法流转返回 409，并使用状态中文名', async () => {
    prisma.task.findUnique.mockResolvedValue(makeTask({ status: 'draft' }));

    const error = await captureError(() =>
      service.transition('task-1', { to: 'done' }, actor),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      message: '不允许从「草稿」直接流转到「已完成」',
      code: 'INVALID_TRANSITION',
      reasons: ['不允许从「草稿」直接流转到「已完成」'],
    });
  });
});
