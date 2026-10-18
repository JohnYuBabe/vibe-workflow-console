import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DecisionStatusValue,
  DecisionSummary,
  DecisionView,
} from './decision.types';
import type { CreateDecisionDto } from './dto/create-decision.dto';
import type { ListDecisionsQueryDto } from './dto/list-decisions-query.dto';
import type { UpdateDecisionDto } from './dto/update-decision.dto';

const decisionInclude = {
  project: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.DecisionInclude;

/** 列表只取摘要字段，不读取 context/options/decision/consequences 等正文列 */
const decisionSummarySelect = {
  id: true,
  projectId: true,
  taskId: true,
  title: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.DecisionSelect;

const DEFAULT_LIST_LIMIT = 100;

type DecisionRow = Prisma.DecisionGetPayload<{
  include: typeof decisionInclude;
}>;

type DecisionSummaryRow = Prisma.DecisionGetPayload<{
  select: typeof decisionSummarySelect;
}>;

function toSummary(row: DecisionSummaryRow): DecisionSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    taskId: row.taskId,
    title: row.title,
    status: row.status as DecisionStatusValue,
    project: { id: row.project.id, name: row.project.name },
    task: row.task ? { id: row.task.id, title: row.task.title } : null,
    createdBy: row.createdBy
      ? { id: row.createdBy.id, name: row.createdBy.name }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toView(row: DecisionRow): DecisionView {
  return {
    ...toSummary(row),
    context: row.context,
    options: row.options,
    decision: row.decision,
    consequences: row.consequences,
  };
}

/** 把纯空白任务 ID 归一为 null，避免空串触发外键错误 */
function normalizeTaskId(taskId: string | null | undefined): string | null {
  return taskId?.trim() || null;
}

/** 决策记录：创建、列表、详情、更新、删除 */
@Injectable()
export class DecisionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    projectId: string,
    dto: CreateDecisionDto,
    actor: AuthUser,
  ): Promise<DecisionView> {
    await this.ensureProject(projectId);

    const taskId = normalizeTaskId(dto.taskId);
    await this.ensureTaskInProject(projectId, taskId);

    const data: Prisma.DecisionUncheckedCreateInput = {
      projectId,
      taskId,
      title: dto.title,
      context: dto.context,
      options: dto.options,
      decision: dto.decision,
      consequences: dto.consequences ?? null,
      status: dto.status ?? 'proposed',
      createdById: actor.id,
    };

    const decision = await this.runWrite(() =>
      this.prisma.decision.create({
        data,
        include: decisionInclude,
      }),
    );

    return toView(decision);
  }

  async list(query: ListDecisionsQueryDto): Promise<DecisionSummary[]> {
    const decisions = await this.prisma.decision.findMany({
      where: {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.taskId ? { taskId: query.taskId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      select: decisionSummarySelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit ?? DEFAULT_LIST_LIMIT,
    });

    return decisions.map(toSummary);
  }

  async getDetail(id: string): Promise<DecisionView> {
    const decision = await this.prisma.decision.findUnique({
      where: { id },
      include: decisionInclude,
    });

    if (!decision) {
      throw new NotFoundException('决策记录不存在');
    }

    return toView(decision);
  }

  async update(id: string, dto: UpdateDecisionDto): Promise<DecisionView> {
    const existing = await this.prisma.decision.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!existing) {
      throw new NotFoundException('决策记录不存在');
    }

    // undefined 表示保持原值；null 表示解除关联；只有字符串才校验任务归属
    const taskId =
      dto.taskId !== undefined ? normalizeTaskId(dto.taskId) : undefined;

    if (typeof taskId === 'string') {
      await this.ensureTaskInProject(existing.projectId, taskId);
    }

    const data: Prisma.DecisionUncheckedUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.context !== undefined ? { context: dto.context } : {}),
      ...(dto.options !== undefined ? { options: dto.options } : {}),
      ...(dto.decision !== undefined ? { decision: dto.decision } : {}),
      ...(dto.consequences !== undefined
        ? { consequences: dto.consequences }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(taskId !== undefined ? { taskId } : {}),
    };

    // 条件写避免「检查后记录被并发删除」时抛出 P2025 变成 500
    const result = await this.runWrite(() =>
      this.prisma.decision.updateMany({ where: { id }, data }),
    );

    if (result.count === 0) {
      throw new NotFoundException('决策记录不存在');
    }

    return this.getDetail(id);
  }

  /** 记录不存在时返回 404；用 deleteMany 避免并发删除抛 P2025 变成 500 */
  async remove(id: string): Promise<void> {
    const result = await this.prisma.decision.deleteMany({ where: { id } });

    if (result.count === 0) {
      throw new NotFoundException('决策记录不存在');
    }
  }

  /** 并发删除项目或任务时外键会抛 P2003，统一映射成 400 而不是 500 */
  private async runWrite<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException('项目或关联任务不存在');
      }

      throw error;
    }
  }

  private async ensureProject(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }
  }

  /** 关联任务必须存在且属于同一项目，否则 400 */
  private async ensureTaskInProject(
    projectId: string,
    taskId: string | null,
  ): Promise<void> {
    if (!taskId) {
      return;
    }

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });

    if (!task || task.projectId !== projectId) {
      throw new BadRequestException('关联任务不存在或不属于该项目');
    }
  }
}
