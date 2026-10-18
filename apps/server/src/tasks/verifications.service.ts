import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '@vibe/shared';
import type { UserRef } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateVerificationDto } from './dto/create-verification.dto';
import type {
  VerificationResultValue,
  VerificationView,
} from './task.types';

const userSelect = { id: true, name: true } as const;

/** 查询结果中映射视图所需的最小字段 */
interface VerificationRow {
  id: string;
  taskId: string;
  command: string;
  result: string;
  evidenceUrl: string | null;
  note: string | null;
  createdAt: Date;
  createdBy: UserRef | null;
}

function toView(row: VerificationRow): VerificationView {
  return {
    id: row.id,
    taskId: row.taskId,
    command: row.command,
    result: row.result as VerificationResultValue,
    evidenceUrl: row.evidenceUrl,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/** 任务验证记录：创建、列表、删除 */
@Injectable()
export class VerificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    taskId: string,
    dto: CreateVerificationDto,
    actor: AuthUser,
  ): Promise<VerificationView> {
    await this.ensureTask(taskId);

    const verification = await this.prisma.verification.create({
      data: {
        taskId,
        command: dto.command,
        result: dto.result,
        evidenceUrl: dto.evidenceUrl ?? null,
        note: dto.note ?? null,
        createdById: actor.id,
      },
      include: { createdBy: { select: userSelect } },
    });

    return toView(verification);
  }

  async list(taskId: string): Promise<VerificationView[]> {
    await this.ensureTask(taskId);

    const verifications = await this.prisma.verification.findMany({
      where: { taskId },
      include: { createdBy: { select: userSelect } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return verifications.map(toView);
  }

  /** 记录不存在或不属于该任务时统一 404，避免暴露其他任务的记录 */
  async remove(taskId: string, verificationId: string): Promise<void> {
    // 用 deleteMany 一步完成「校验归属 + 删除」：
    // 先查再删会在并发删除时抛 Prisma P2025，变成 500 而不是 404。
    const result = await this.prisma.verification.deleteMany({
      where: { id: verificationId, taskId },
    });

    if (result.count === 0) {
      throw new NotFoundException('验证记录不存在');
    }
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
