import { Injectable, NotFoundException } from '@nestjs/common';
import type { TaskStatus } from '@vibe/shared';
import { availableTransitions } from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import type { UpdateCriteriaDto } from './dto/update-criteria.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import { buildGateInput, summarizeGate } from './task-gate.util';
import type { TaskDetail, TaskSummary } from './task.types';

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
      include: { _count: { select: { criteria: true } } },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    return tasks.map((task) => ({
      id: task.id,
      projectId: task.projectId,
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
      availableTransitions: availableTransitions(input, status),
      gate: summarizeGate(input),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  async update(id: string, dto: UpdateTaskDto): Promise<TaskDetail> {
    await this.ensureExists(id);

    await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.spec !== undefined ? { spec: dto.spec } : {}),
        ...(dto.manualNote !== undefined
          ? { manualNote: dto.manualNote }
          : {}),
      },
    });

    return this.getDetail(id);
  }

  async replaceCriteria(
    id: string,
    dto: UpdateCriteriaDto,
  ): Promise<TaskDetail> {
    await this.ensureExists(id);
    const items = cleanCriteria(dto.items);

    // 按数组顺序重写：先清空再按 position 写入，过滤空串
    await this.prisma.$transaction(async (tx) => {
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

  private async ensureExists(id: string): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException('任务不存在');
    }
  }
}
