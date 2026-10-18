import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTaskDto } from './update-task.dto';

function validatePayload(payload: Record<string, unknown>) {
  return validate(plainToInstance(UpdateTaskDto, payload));
}

describe('UpdateTaskDto', () => {
  it('title 为 null 时返回校验错误，而不是放行给 Prisma', async () => {
    const errors = await validatePayload({ title: null });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('title');
    expect(errors[0].constraints).toHaveProperty('isString');
  });

  it('未传 title 时不校验', async () => {
    await expect(validatePayload({ spec: '新规格' })).resolves.toHaveLength(0);
  });

  it('title 去空白后按空串校验', async () => {
    const errors = await validatePayload({ title: '   ' });

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty('isLength');
  });
});
