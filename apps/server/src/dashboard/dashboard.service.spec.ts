import type { TaskStatus } from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';
import type { TaskRef } from './dashboard.types';

interface PrismaMock {
  project: { count: jest.Mock };
  task: { findMany: jest.Mock; groupBy: jest.Mock };
  decision: { count: jest.Mock };
  aiSession: { count: jest.Mock };
  verification: { count: jest.Mock };
  $transaction: jest.Mock;
}

function statusGroup(status: TaskStatus, count: number) {
  return { status, _count: { _all: count } };
}

/** 30 字，超过规格门禁的 20 字下限 */
const LONG_SPEC = '这是一段足够长的任务规格说明。'.repeat(2);
/** 超过 20 字的人工追溯记录 */
const LONG_NOTE =
  '人工记录：本次交付已与 AI 协同完成，包含实现细节和验证过程。';

const taskRef: TaskRef = {
  id: 'task-1',
  title: '实现登录',
  project: { id: 'project-1', name: '任务控制台' },
};

function makeTask(
  overrides: {
    id?: string;
    title?: string;
    status?: TaskStatus;
    spec?: string | null;
    manualNote?: string | null;
    criteria?: string[];
    passedVerifications?: number;
    aiSessions?: number;
  } = {},
) {
  const criteria = overrides.criteria ?? ['标准一', '标准二', '标准三'];

  return {
    id: overrides.id ?? 'task-1',
    title: overrides.title ?? '实现登录',
    status: overrides.status ?? 'draft',
    spec: overrides.spec === undefined ? LONG_SPEC : overrides.spec,
    manualNote:
      overrides.manualNote === undefined ? null : overrides.manualNote,
    project: { id: 'project-1', name: '任务控制台' },
    criteria: criteria.map((content) => ({ content })),
    _count: {
      verifications: overrides.passedVerifications ?? 0,
      aiSessions: overrides.aiSessions ?? 0,
    },
    updatedAt: new Date('2026-10-18T00:00:00.000Z'),
  };
}

describe('DashboardService', () => {
  let prisma: PrismaMock;
  let service: DashboardService;

  function setVerificationCounts(total: number, passed: number): void {
    prisma.verification.count.mockImplementation(
      (args?: { where?: { result?: string } }) =>
        Promise.resolve(args?.where?.result === 'passed' ? passed : total),
    );
  }

  beforeEach(() => {
    prisma = {
      project: { count: jest.fn().mockResolvedValue(0) },
      task: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      decision: { count: jest.fn().mockResolvedValue(0) },
      aiSession: { count: jest.fn().mockResolvedValue(0) },
      verification: {
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };

    service = new DashboardService(prisma as unknown as PrismaService);
  });

  it('ready 任务规格不足时进入 spec 阻塞列表', async () => {
    prisma.task.findMany.mockResolvedValue([
      makeTask({ status: 'ready', spec: '太短了' }),
    ]);
    prisma.task.groupBy.mockResolvedValue([statusGroup('ready', 1)]);

    const summary = await service.getSummary();

    expect(summary.blocked.spec).toEqual([taskRef]);
    expect(summary.blocked.verification).toEqual([]);
    expect(summary.blocked.traceability).toEqual([]);
    expect(summary.statusCounts).toEqual({
      draft: 0,
      ready: 1,
      in_progress: 0,
      review: 0,
      done: 0,
    });
    // 只加载会进入阻塞列表的状态，状态分布来自分组计数
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['ready', 'review'] } },
      }),
    );
    expect(prisma.task.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      _count: { _all: true },
    });
    // 整个汇总只读取一次事务快照
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('ready 任务验收标准不足时同样进入 spec 阻塞列表', async () => {
    prisma.task.findMany.mockResolvedValue([
      makeTask({ status: 'ready', criteria: ['标准一', '标准二'] }),
    ]);

    const summary = await service.getSummary();

    expect(summary.blocked.spec).toEqual([taskRef]);
  });

  it('review 任务没有通过验证时进入 verification 阻塞列表', async () => {
    prisma.task.findMany.mockResolvedValue([
      makeTask({
        status: 'review',
        manualNote: LONG_NOTE,
        passedVerifications: 0,
        aiSessions: 0,
      }),
    ]);

    const summary = await service.getSummary();

    expect(summary.blocked.verification).toEqual([taskRef]);
    expect(summary.blocked.traceability).toEqual([]);
    expect(summary.blocked.spec).toEqual([]);
  });

  it('review 任务没有 AI 会话且人工记录不足时进入 traceability 阻塞列表', async () => {
    prisma.task.findMany.mockResolvedValue([
      makeTask({
        status: 'review',
        manualNote: '太短',
        passedVerifications: 1,
        aiSessions: 0,
      }),
    ]);

    const summary = await service.getSummary();

    expect(summary.blocked.traceability).toEqual([taskRef]);
    expect(summary.blocked.verification).toEqual([]);
    expect(summary.blocked.spec).toEqual([]);
  });

  it('done 任务不进入任何阻塞列表，并汇总总量与通过率', async () => {
    prisma.project.count.mockResolvedValue(1);
    prisma.decision.count.mockResolvedValue(2);
    prisma.aiSession.count.mockResolvedValue(1);
    setVerificationCounts(4, 3);
    // done 不在 ready/review 子集里，不会进入 findMany 的结果
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.groupBy.mockResolvedValue([statusGroup('done', 1)]);

    const summary = await service.getSummary();

    expect(summary.blocked).toEqual({
      spec: [],
      verification: [],
      traceability: [],
    });
    expect(summary.statusCounts.done).toBe(1);
    expect(summary.totals).toEqual({
      projects: 1,
      tasks: 1,
      decisions: 2,
      aiSessions: 1,
    });
    expect(summary.verification).toEqual({
      total: 4,
      passed: 3,
      failed: 1,
      passRate: 0.75,
    });
    expect(summary.generatedAt).toBeInstanceOf(Date);
  });

  it('空数据库返回全零计数与 null 通过率', async () => {
    const summary = await service.getSummary();

    expect(summary.totals).toEqual({
      projects: 0,
      tasks: 0,
      decisions: 0,
      aiSessions: 0,
    });
    expect(summary.statusCounts).toEqual({
      draft: 0,
      ready: 0,
      in_progress: 0,
      review: 0,
      done: 0,
    });
    expect(summary.verification).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
      passRate: null,
    });
    expect(summary.blocked).toEqual({
      spec: [],
      verification: [],
      traceability: [],
    });
  });
});
