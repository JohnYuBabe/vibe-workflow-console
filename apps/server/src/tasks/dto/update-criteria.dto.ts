import {
  ArrayMaxSize,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCriteriaDto {
  @IsArray({ message: '验收标准必须是字符串数组' })
  @ArrayMaxSize(100, { message: '验收标准最多 100 条' })
  @IsString({ each: true, message: '验收标准必须是字符串' })
  @MaxLength(500, { each: true, message: '单条验收标准最多 500 字' })
  items!: string[];
}
