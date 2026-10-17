import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '@vibe/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { TransitionTaskDto } from './dto/transition-task.dto';
import { UpdateCriteriaDto } from './dto/update-criteria.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskStatusService } from './task-status.service';
import type { TaskDetail, TaskSummary } from './task.types';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly status: TaskStatusService,
  ) {}

  @Post('projects/:projectId/tasks')
  @RequirePermission('task:write')
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskDetail> {
    return this.tasks.create(projectId, dto);
  }

  @Get('tasks')
  @RequirePermission('task:read')
  list(@Query() query: ListTasksQueryDto): Promise<TaskSummary[]> {
    return this.tasks.list(query);
  }

  @Get('tasks/:id')
  @RequirePermission('task:read')
  getDetail(@Param('id') id: string): Promise<TaskDetail> {
    return this.tasks.getDetail(id);
  }

  @Patch('tasks/:id')
  @RequirePermission('task:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskDetail> {
    return this.tasks.update(id, dto);
  }

  @Put('tasks/:id/criteria')
  @RequirePermission('task:write')
  replaceCriteria(
    @Param('id') id: string,
    @Body() dto: UpdateCriteriaDto,
  ): Promise<TaskDetail> {
    return this.tasks.replaceCriteria(id, dto);
  }

  @Post('tasks/:id/transitions')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('task:write')
  transition(
    @Param('id') id: string,
    @Body() dto: TransitionTaskDto,
    @CurrentUser() user: AuthUser,
  ): Promise<TaskDetail> {
    return this.status.transition(id, dto, user);
  }
}
