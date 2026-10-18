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
import { CreateVerificationDto } from './dto/create-verification.dto';
import type { VerificationView } from './task.types';
import { VerificationsService } from './verifications.service';

@Controller('tasks/:taskId/verifications')
export class VerificationsController {
  constructor(private readonly verifications: VerificationsService) {}

  @Post()
  @RequirePermission('task:write')
  create(
    @Param('taskId') taskId: string,
    @Body() dto: CreateVerificationDto,
    @CurrentUser() user: AuthUser,
  ): Promise<VerificationView> {
    return this.verifications.create(taskId, dto, user);
  }

  @Get()
  @RequirePermission('task:read')
  list(@Param('taskId') taskId: string): Promise<VerificationView[]> {
    return this.verifications.list(taskId);
  }

  @Delete(':verificationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('task:write')
  remove(
    @Param('taskId') taskId: string,
    @Param('verificationId') verificationId: string,
  ): Promise<void> {
    return this.verifications.remove(taskId, verificationId);
  }
}
