import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '@vibe/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import type { ProjectDetail, ProjectSummary } from './project.types';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermission('project:read')
  list(): Promise<ProjectSummary[]> {
    return this.projects.list();
  }

  @Post()
  @RequirePermission('project:write')
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProjectSummary> {
    return this.projects.create(dto, user);
  }

  @Get(':id')
  @RequirePermission('project:read')
  getDetail(@Param('id') id: string): Promise<ProjectDetail> {
    return this.projects.getDetail(id);
  }

  @Patch(':id')
  @RequirePermission('project:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectDetail> {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('project:write')
  async remove(@Param('id') id: string): Promise<void> {
    await this.projects.remove(id);
  }
}
