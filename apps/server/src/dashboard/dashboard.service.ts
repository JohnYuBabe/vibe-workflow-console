import { Injectable } from '@nestjs/common';
import type { TaskGateInput, TaskStatus } from '@vibe/shared';
import {
  TASK_STATUSES,
  summarizeCompletionGate,
  summarizeSpecGate,
} from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { DashboardSummary, TaskRef } from './dashboard.types';

/** 汇总查询所需的任务字段，门禁输入全部来自这里 */
interface SummaryTaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  spec: string | null;
  manualNote: string | null;
  project: { id: string; name: string };
  criteria: Array<{ content: string }>;
  _count: { verifications: number; aiSessions: number };
}

/** 从共享状态常量派生，新增状态时这里不用补键 */
function emptyStatusCounts(): Record<TaskStatus, number> {
  return Object.fromEntries(
    TASK_STATUSES.map((status) => [status, 0]),
  ) as Record<TaskStatus, number>;
}

function toTaskRef(task: SummaryTaskRow): TaskRef {
  return {
    id: task.id,
    title: task.title,
    project: task.project,
  };
}

/** 仪表盘汇总：一次事务快照内读取全部计数与门禁所需任务字段 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<DashboardSummary> {
    // 单独构造分组查询，避免内联在 $transaction 数组里丢失 Prisma 的重载推断
    const statusGroupsQuery = this.prisma.task.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    // 数组形式的事务在同一个快照内执行，避免各计数之间出现时间差。
    const [
      projectCount,
      decisionCount,
      aiSessionCount,
      verificationTotal,
      verificationPassed,
      statusGroups,
      tasks,
    ] = await this.prisma.$transaction([
      this.prisma.project.count(),
      this.prisma.decision.count(),
      this.prisma.aiSession.count(),
      this.prisma.verification.count(),
      this.prisma.verification.count({ where: { result: 'passed' } }),
      // 状态分布用分组计数，不把全部任务行拉回内存
      statusGroupsQuery,
      this.prisma.task.findMany({
        // 只有 ready / review 会进入阻塞列表，其余状态不需要门禁数据
        where: { status: { in: ['ready', 'review'] } },
        select: {
          id: true,
          title: true,
          status: true,
          spec: true,
          manualNote: true,
          project: { select: { id: true, name: true } },
          // 验收标准取内容而不是只取条数：summarizeSpecGate 会过滤空白项，
          // 只传数量会让看板的 criteriaOk 与真实门禁口径不一致。
          criteria: { select: { content: true } },
          _count: {
            select: {
              verifications: { where: { result: 'passed' } },
              aiSessions: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const statusCounts = emptyStatusCounts();
    let taskTotal = 0;
    for (const group of statusGroups) {
      const status = group.status as TaskStatus;
      statusCounts[status] = group._count._all;
      taskTotal += group._count._all;
    }

    const blocked: DashboardSummary['blocked'] = {
      spec: [],
      verification: [],
      traceability: [],
    };

    for (const task of tasks) {
      const status = task.status as TaskStatus;

      const gateInput: TaskGateInput = {
        spec: task.spec,
        acceptanceCriteria: task.criteria.map((criterion) => criterion.content),
        passedVerifications: task._count.verifications,
        aiSessionCount: task._count.aiSessions,
        manualNote: task.manualNote,
      };

      // 门禁结果直接取自共享策略，阻塞列表与真实流转判断不会走两套口径。
      const specGate = summarizeSpecGate(gateInput);
      const completionGate = summarizeCompletionGate(gateInput);
      const ref = toTaskRef(task);

      if (status === 'ready' && (!specGate.specOk || !specGate.criteriaOk)) {
        blocked.spec.push(ref);
      }

      if (status === 'review' && !completionGate.verificationOk) {
        blocked.verification.push(ref);
      }

      // traceabilityOk 已包含「至少 1 条 AI 会话或人工记录不少于 20 字」
      if (status === 'review' && !completionGate.traceabilityOk) {
        blocked.traceability.push(ref);
      }
    }

    return {
      generatedAt: new Date(),
      totals: {
        projects: projectCount,
        tasks: taskTotal,
        decisions: decisionCount,
        aiSessions: aiSessionCount,
      },
      statusCounts,
      verification: {
        total: verificationTotal,
        passed: verificationPassed,
        failed: verificationTotal - verificationPassed,
        passRate:
          verificationTotal === 0
            ? null
            : verificationPassed / verificationTotal,
      },
      blocked,
    };
  }
}
