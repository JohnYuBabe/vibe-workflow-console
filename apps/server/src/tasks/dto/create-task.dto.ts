import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTaskDto {
  @Transform(trim)
  @IsString({ message: '任务标题不能为空' })
  @Length(1, 120, { message: '任务标题长度需在 1 到 120 字之间' })
  title!: string;

  @IsOptional()
  @IsString({ message: '任务规格格式不正确' })
  @MaxLength(16000, { message: '任务规格最多 16000 字' })
  spec?: string;

  @IsOptional()
  @IsArray({ message: '验收标准必须是字符串数组' })
  @ArrayMaxSize(100, { message: '验收标准最多 100 条' })
  @IsString({ each: true, message: '验收标准必须是字符串' })
  @MaxLength(500, { each: true, message: '单条验收标准最多 500 字' })
  acceptanceCriteria?: string[];
}
