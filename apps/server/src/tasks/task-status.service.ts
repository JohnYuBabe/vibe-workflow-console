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
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { criteria: true },
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

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: { status: dto.to },
      });

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
