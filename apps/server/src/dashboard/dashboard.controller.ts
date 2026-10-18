import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { DashboardService } from './dashboard.service';
import type { DashboardSummary } from './dashboard.types';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @RequirePermission('task:read')
  getSummary(): Promise<DashboardSummary> {
    return this.dashboard.getSummary();
  }
}
