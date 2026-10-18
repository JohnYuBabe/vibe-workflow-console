import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/** 去掉首尾空白，并把纯空白串转成 null */
const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateVerificationDto {
  @Transform(trim)
  @IsString({ message: '验证命令不能为空' })
  @Length(1, 500, { message: '验证命令长度需在 1 到 500 字之间' })
  command!: string;

  @IsIn(['passed', 'failed'], {
    message: '验证结果只能是 passed 或 failed',
  })
  result!: 'passed' | 'failed';

  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: '证据链接格式不正确' })
  @MaxLength(1000, { message: '证据链接最多 1000 字' })
  // 只允许 http(s)，避免 javascript: / data: 之类被存进库再渲染成链接
  @Matches(/^https?:\/\//i, {
    message: '证据链接需以 http:// 或 https:// 开头',
  })
  evidenceUrl?: string | null;

  @IsOptional()
  @IsString({ message: '验证备注格式不正确' })
  @MaxLength(5000, { message: '验证备注最多 5000 字' })
  note?: string;
}
