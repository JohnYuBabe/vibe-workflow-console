import { Injectable, NotFoundException } from '@nestjs/common';
import type { TaskStatus } from '@vibe/shared';
import { availableTransitions } from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';
import { assertTaskMutable } from './assert-task-mutable.util';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import type { UpdateCriteriaDto } from './dto/update-criteria.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import { buildGateInput, summarizeGate } from './task-gate.util';
import type {
  TaskDetail,
  TaskSummary,
  VerificationResultValue,
} from './task.types';

/** 去掉首尾空白并丢弃空串 */
function cleanCriteria(items: string[]): string[] {
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateTaskDto): Promise<TaskDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    const criteria = cleanCriteria(dto.acceptanceCriteria ?? []);

    const task = await this.prisma.task.create({
      data: {
        projectId,
        title: dto.title,
        spec: dto.spec ?? null,
        criteria: criteria.length
          ? {
              create: criteria.map((content, position) => ({
                content,
                position,
              })),
            }
          : undefined,
      },
    });

    return this.getDetail(task.id);
  }

  async list(query: ListTasksQueryDto): Promise<TaskSummary[]> {
    const tasks = await this.prisma.task.findMany({
      where: {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        _count: { select: { criteria: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    return tasks.map((task) => ({
      id: task.id,
      projectId: task.projectId,
      project: { id: task.project.id, name: task.project.name },
      title: task.title,
      status: task.status as TaskStatus,
      criteriaCount: task._count.criteria,
      updatedAt: task.updatedAt,
    }));
  }

  async getDetail(id: string): Promise<TaskDetail> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        criteria: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
        transitions: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        verifications: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        aiSessions: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    const status = task.status as TaskStatus;
    const input = buildGateInput(task);

    return {
      id: task.id,
      project: { id: task.project.id, name: task.project.name },
      title: task.title,
      spec: task.spec,
      manualNote: task.manualNote,
      status,
      criteria: task.criteria.map((criterion) => ({
        id: criterion.id,
        content: criterion.content,
        position: criterion.position,
      })),
      transitions: task.transitions.map((transition) => ({
        id: transition.id,
        fromStatus: transition.fromStatus as TaskStatus | null,
        toStatus: transition.toStatus as TaskStatus,
        actor: transition.actor,
        note: transition.note,
        createdAt: transition.createdAt,
      })),
      verifications: task.verifications.map((verification) => ({
        id: verification.id,
        taskId: verification.taskId,
        command: verification.command,
        result: verification.result as VerificationResultValue,
        evidenceUrl: verification.evidenceUrl,
        note: verification.note,
        createdBy: verification.createdBy,
        createdAt: verification.createdAt,
      })),
      aiSessions: task.aiSessions.map((session) => ({
        id: session.id,
        taskId: session.taskId,
        title: session.title,
        tool: session.tool,
        summary: session.summary,
        createdBy: session.createdBy,
        createdAt: session.createdAt,
      })),
      availableTransitions: availableTransitions(input, status),
      gate: summarizeGate(input),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  async update(id: string, dto: UpdateTaskDto): Promise<TaskDetail> {
    await this.prisma.$transaction(async (tx) => {
      await assertTaskMutable(tx, id);

      await tx.task.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.spec !== undefined ? { spec: dto.spec } : {}),
          ...(dto.manualNote !== undefined
            ? { manualNote: dto.manualNote }
            : {}),
        },
      });
    });

    return this.getDetail(id);
  }

  async replaceCriteria(
    id: string,
    dto: UpdateCriteriaDto,
  ): Promise<TaskDetail> {
    const items = cleanCriteria(dto.items);

    // 按数组顺序重写：先在事务里锁住任务校验状态，再清空、按 position 写入
    await this.prisma.$transaction(async (tx) => {
      await assertTaskMutable(tx, id);

      await tx.acceptanceCriterion.deleteMany({ where: { taskId: id } });

      if (items.length > 0) {
        await tx.acceptanceCriterion.createMany({
          data: items.map((content, position) => ({
            taskId: id,
            content,
            position,
          })),
        });
      }
    });

    return this.getDetail(id);
  }

  /** 删除任务；记录不存在或已被并发删除时统一 404 */
  async remove(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 删除会级联清掉验收标准、验证与追溯记录，done 任务必须保持一致不可删
      await assertTaskMutable(tx, id);

      // deleteMany 用 count 判定，并发删除不会抛 P2025 变成 500
      const result = await tx.task.deleteMany({ where: { id } });

      if (result.count === 0) {
        throw new NotFoundException('任务不存在');
      }
    });
  }
}
