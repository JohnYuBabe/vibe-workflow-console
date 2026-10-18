import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

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

export class CreateAiSessionDto {
  @Transform(trim)
  @IsString({ message: 'AI 会话标题不能为空' })
  @Length(1, 200, { message: 'AI 会话标题长度需在 1 到 200 字之间' })
  title!: string;

  @IsOptional()
  @Transform(trimToNull)
  @IsString({ message: '工具名称格式不正确' })
  @MaxLength(100, { message: '工具名称最多 100 字' })
  tool?: string | null;

  @IsOptional()
  @IsString({ message: '会话摘要格式不正确' })
  @MaxLength(5000, { message: '会话摘要最多 5000 字' })
  summary?: string;
}
