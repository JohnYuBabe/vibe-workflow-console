import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  DECISION_STATUSES,
  type DecisionStatusValue,
} from '../decision.types';

export class ListDecisionsQueryDto {
  @IsOptional()
  @IsString({ message: '项目 ID 格式不正确' })
  projectId?: string;

  @IsOptional()
  @IsString({ message: '任务 ID 格式不正确' })
  taskId?: string;

  @IsOptional()
  @IsIn(DECISION_STATUSES, { message: '无效的决策状态' })
  status?: DecisionStatusValue;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: '返回数量需为整数' })
  @Min(1, { message: '返回数量最少为 1' })
  @Max(200, { message: '返回数量最多为 200' })
  limit?: number;
}
