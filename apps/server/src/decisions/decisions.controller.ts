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
  Query,
} from '@nestjs/common';
import type { AuthUser } from '@vibe/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { DecisionSummary, DecisionView } from './decision.types';
import { DecisionsService } from './decisions.service';
import { CreateDecisionDto } from './dto/create-decision.dto';
import { ListDecisionsQueryDto } from './dto/list-decisions-query.dto';
import { UpdateDecisionDto } from './dto/update-decision.dto';

@Controller()
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Post('projects/:projectId/decisions')
  @RequirePermission('decision:write')
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateDecisionDto,
    @CurrentUser() user: AuthUser,
  ): Promise<DecisionView> {
    return this.decisions.create(projectId, dto, user);
  }

  @Get('decisions')
  @RequirePermission('decision:read')
  list(@Query() query: ListDecisionsQueryDto): Promise<DecisionSummary[]> {
    return this.decisions.list(query);
  }

  @Get('decisions/:id')
  @RequirePermission('decision:read')
  getDetail(@Param('id') id: string): Promise<DecisionView> {
    return this.decisions.getDetail(id);
  }

  @Patch('decisions/:id')
  @RequirePermission('decision:write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDecisionDto,
  ): Promise<DecisionView> {
    return this.decisions.update(id, dto);
  }

  @Delete('decisions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('decision:write')
  async remove(@Param('id') id: string): Promise<void> {
    await this.decisions.remove(id);
  }
}
