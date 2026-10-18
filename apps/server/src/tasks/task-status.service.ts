import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AuthUser,
  TaskStatus,
  TransitionErrorCode,
  TransitionEvaluation,
} from '@vibe/shared';
import { evaluateTransition } from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { TransitionTaskDto } from './dto/transition-task.dto';
import { buildGateInput } from './task-gate.util';
import type { TaskDetail } from './task.types';
import { TasksService } from './tasks.service';

/**
 * 任务状态流转：唯一入口。
 * 门禁判断全部委托给 packages/shared 的 evaluateTransition，
 * 这里只负责加载数据、映射 HTTP 错误码、落库并返回详情。
 */
@Injectable()
export class TaskStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  async transition(
    taskId: string,
    dto: TransitionTaskDto,
    actor: AuthUser,
  ): Promise<TaskDetail> {
    // 门禁读取、判定与写入放在同一事务里，状态更新再用 where status = from 做条件写。
    // 否则并发请求会各自基于旧状态通过门禁，写出互相矛盾的历史
    //（例如同时出现 review -> in_progress 与 review -> done）。
    await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: {
          criteria: true,
          // 门禁只关心是否通过与会话条数，不加载正文
          verifications: { select: { result: true } },
          aiSessions: { select: { id: true } },
        },
      });

      if (!task) {
        throw new NotFoundException('任务不存在');
      }

      const input = buildGateInput(task);
      const evaluation = evaluateTransition(
        input,
        task.status as TaskStatus,
        dto.to,
      );

      if (!evaluation.allowed) {
        this.throwTransitionError(evaluation);
      }

      const updated = await tx.task.updateMany({
        where: { id: taskId, status: task.status },
        data: { status: dto.to },
      });

      // 条件写没命中，说明状态已被其他请求改掉，本次流转作废
      if (updated.count === 0) {
        throw new ConflictException({
          message: '任务状态已被其他操作修改，请刷新后重试',
          code: 'INVALID_TRANSITION',
          reasons: ['任务状态已被其他操作修改，请刷新后重试'],
        });
      }

      await tx.taskTransition.create({
        data: {
          taskId,
          fromStatus: task.status,
          toStatus: dto.to,
          actorId: actor.id,
          note: dto.note ?? null,
        },
      });
    });

    return this.tasks.getDetail(taskId);
  }

  private throwTransitionError(evaluation: TransitionEvaluation): never {
    // 规格门禁单独用 422，前端可以据此引导补齐规格与验收标准
    if (evaluation.code === 'SPEC_GATE') {
      throw new UnprocessableEntityException({
        message: '规格门禁未通过',
        code: 'SPEC_GATE',
        reasons: evaluation.reasons,
      });
    }

    // 非法流转、验证缺失、追溯缺失统一 409
    const code: TransitionErrorCode =
      evaluation.code ?? 'INVALID_TRANSITION';

    throw new ConflictException({
      message: evaluation.reasons[0] ?? '任务流转失败',
      code,
      reasons: evaluation.reasons,
    });
  }
}
