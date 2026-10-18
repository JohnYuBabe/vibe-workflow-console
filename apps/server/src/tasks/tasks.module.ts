import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiSessionsController } from './ai-sessions.controller';
import { AiSessionsService } from './ai-sessions.service';
import { TaskStatusService } from './task-status.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { VerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    TasksController,
    VerificationsController,
    AiSessionsController,
  ],
  providers: [
    TasksService,
    TaskStatusService,
    VerificationsService,
    AiSessionsService,
  ],
  exports: [TasksService],
})
export class TasksModule {}
