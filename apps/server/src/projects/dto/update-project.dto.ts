import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateProjectDto {
  // null 也要走 @IsString：@IsOptional 会放行 null，导致 Prisma 抛校验错变成 500
  @ValidateIf((_, value) => value !== undefined)
  @Transform(trim)
  @IsString({ message: '项目名称不能为空' })
  @Length(1, 80, { message: '项目名称长度需在 1 到 80 字之间' })
  name?: string;

  @IsOptional()
  @IsString({ message: '项目描述格式不正确' })
  @MaxLength(2000, { message: '项目描述最多 2000 字' })
  description?: string;

  @IsOptional()
  @IsString({ message: '仓库地址格式不正确' })
  @MaxLength(191, { message: '仓库地址最多 191 字' })
  repoUrl?: string;
}
