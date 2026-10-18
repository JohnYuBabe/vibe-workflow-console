import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import {
  DECISION_STATUSES,
  type DecisionStatusValue,
} from '../decision.types';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** 去掉首尾空白，并把纯空白串转成 null */
const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export class CreateDecisionDto {
  @Transform(trim)
  @IsString({ message: '决策标题不能为空' })
  @Length(1, 200, { message: '决策标题长度需在 1 到 200 字之间' })
  title!: string;

  @Transform(trim)
  @IsString({ message: '背景不能为空' })
  @Length(1, 5000, { message: '背景长度需在 1 到 5000 字之间' })
  context!: string;

  @Transform(trim)
  @IsString({ message: '备选方案不能为空' })
  @Length(1, 5000, { message: '备选方案长度需在 1 到 5000 字之间' })
  options!: string;

  @Transform(trim)
  @IsString({ message: '决策结论不能为空' })
  @Length(1, 5000, { message: '决策结论长度需在 1 到 5000 字之间' })
  decision!: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: '影响与后果格式不正确' })
  @MaxLength(5000, { message: '影响与后果最多 5000 字' })
  consequences?: string | null;

  @IsOptional()
  @IsIn(DECISION_STATUSES, { message: '无效的决策状态' })
  status?: DecisionStatusValue;

  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: '关联任务 ID 格式不正确' })
  taskId?: string | null;
}
