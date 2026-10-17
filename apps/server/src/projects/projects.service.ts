import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser, TaskStatus } from '@vibe/shared';
import { TASK_STATUSES } from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { ProjectDetail, ProjectSummary } from './project.types';

const ownerSelect = { id: true, name: true } as const;

/** 列表查询需要的最小项目行，用于统一计算任务统计 */
interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
  owner: { id: string; name: string };
  tasks: Array<{ status: string }>;
  createdAt: Date;
}

function emptyStatusCounts(): Record<TaskStatus, number> {
  // 从共享常量派生，新增状态时不用再来这里补一行
  return Object.fromEntries(
    TASK_STATUSES.map((status) => [status, 0]),
  ) as Record<TaskStatus, number>;
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ProjectSummary[]> {
    const projects = await this.prisma.project.findMany({
      include: {
        owner: { select: ownerSelect },
        tasks: { select: { status: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    return projects.map((project) => this.toSummary(project));
  }

  async create(dto: CreateProjectDto, owner: AuthUser): Promise<ProjectSummary> {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        repoUrl: dto.repoUrl ?? null,
        ownerId: owner.id,
      },
      include: {
        owner: { select: ownerSelect },
        tasks: { select: { status: true } },
      },
    });

    return this.toSummary(project);
  }

  async getDetail(id: string): Promise<ProjectDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        owner: { select: ownerSelect },
        tasks: {
          select: {
            id: true,
            projectId: true,
            title: true,
            status: true,
            updatedAt: true,
            _count: { select: { criteria: true } },
          },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      repoUrl: project.repoUrl,
      owner: project.owner,
      tasks: project.tasks.map((task) => ({
        id: task.id,
        projectId: task.projectId,
        title: task.title,
        status: task.status as TaskStatus,
        criteriaCount: task._count.criteria,
        updatedAt: task.updatedAt,
      })),
      createdAt: project.createdAt,
    };
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectDetail> {
    await this.ensureExists(id);

    await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.repoUrl !== undefined ? { repoUrl: dto.repoUrl } : {}),
      },
    });

    return this.getDetail(id);
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.project.delete({ where: { id } });
  }

  private async ensureExists(id: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }
  }

  private toSummary(project: ProjectRow): ProjectSummary {
    const statusCounts = emptyStatusCounts();

    for (const task of project.tasks) {
      if (isTaskStatus(task.status)) {
        statusCounts[task.status] += 1;
      }
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      repoUrl: project.repoUrl,
      owner: project.owner,
      taskCount: project.tasks.length,
      statusCounts,
      createdAt: project.createdAt,
    };
  }
}
