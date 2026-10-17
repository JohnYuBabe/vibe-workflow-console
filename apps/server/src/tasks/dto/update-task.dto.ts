import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateTaskDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: '任务标题不能为空' })
  @Length(1, 120, { message: '任务标题长度需在 1 到 120 字之间' })
  title?: string;

  @IsOptional()
  @IsString({ message: '任务规格格式不正确' })
  @MaxLength(16000, { message: '任务规格最多 16000 字' })
  spec?: string;

  @IsOptional()
  @IsString({ message: '人工记录格式不正确' })
  @MaxLength(5000, { message: '人工记录最多 5000 字' })
  manualNote?: string;
}
