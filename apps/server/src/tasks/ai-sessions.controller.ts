import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '@vibe/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AiSessionsService } from './ai-sessions.service';
import { CreateAiSessionDto } from './dto/create-ai-session.dto';
import type { AiSessionView } from './task.types';

@Controller('tasks/:taskId/ai-sessions')
export class AiSessionsController {
  constructor(private readonly sessions: AiSessionsService) {}

  @Post()
  @RequirePermission('task:write')
  create(
    @Param('taskId') taskId: string,
    @Body() dto: CreateAiSessionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AiSessionView> {
    return this.sessions.create(taskId, dto, user);
  }

  @Get()
  @RequirePermission('task:read')
  list(@Param('taskId') taskId: string): Promise<AiSessionView[]> {
    return this.sessions.list(taskId);
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('task:write')
  remove(
    @Param('taskId') taskId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    return this.sessions.remove(taskId, sessionId);
  }
}
