import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@vibe/shared';
import type { UserRef } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { assertTaskMutable } from './assert-task-mutable.util';
import type { CreateAiSessionDto } from './dto/create-ai-session.dto';
import type { AiSessionView } from './task.types';

const userSelect = { id: true, name: true } as const;

/** 查询结果中映射视图所需的最小字段 */
interface AiSessionRow {
  id: string;
  taskId: string;
  title: string;
  tool: string | null;
  summary: string | null;
  createdAt: Date;
  createdBy: UserRef | null;
}

function toView(row: AiSessionRow): AiSessionView {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    tool: row.tool,
    summary: row.summary,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/** AI 会话记录：创建、列表、删除 */
@Injectable()
export class AiSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    taskId: string,
    dto: CreateAiSessionDto,
    actor: AuthUser,
  ): Promise<AiSessionView> {
    const session = await this.prisma.$transaction(async (tx) => {
      await assertTaskMutable(tx, taskId);

      return tx.aiSession.create({
        data: {
          taskId,
          title: dto.title,
          tool: dto.tool ?? null,
          summary: dto.summary ?? null,
          createdById: actor.id,
        },
        include: { createdBy: { select: userSelect } },
      });
    });

    return toView(session);
  }

  async list(taskId: string): Promise<AiSessionView[]> {
    await this.ensureTask(taskId);

    const sessions = await this.prisma.aiSession.findMany({
      where: { taskId },
      include: { createdBy: { select: userSelect } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return sessions.map(toView);
  }

  /** 记录不存在或不属于该任务时统一 404，避免暴露其他任务的记录 */
  async remove(taskId: string, sessionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // done 任务门禁已定格，删除追溯记录同样被拒绝
      await assertTaskMutable(tx, taskId);

      // 先查再删在并发删除时会抛 Prisma P2025，变成 500 而不是 404
      const result = await tx.aiSession.deleteMany({
        where: { id: sessionId, taskId },
      });

      if (result.count === 0) {
        throw new NotFoundException('AI 会话不存在');
      }
    });
  }

  private async ensureTask(taskId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }
  }
}
