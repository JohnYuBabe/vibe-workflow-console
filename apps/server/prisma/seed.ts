import { PrismaClient } from '@prisma/client';
import {
  DEMO_ACCOUNTS,
  PERMISSION_LIST,
  ROLE_PRESETS,
} from '@vibe/shared';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  editor: '编辑',
  viewer: '访客',
};

async function main(): Promise<void> {
  const permissionIds = new Map<string, string>();

  for (const key of PERMISSION_LIST) {
    const [resource, action] = key.split(':');
    const permission = await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      update: {},
      create: { resource, action },
    });
    permissionIds.set(key, permission.id);
  }

  for (const [name, keys] of Object.entries(ROLE_PRESETS)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: ROLE_LABELS[name] },
      create: { name, description: ROLE_LABELS[name] },
    });

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: keys.map((key) => ({
        roleId: role.id,
        permissionId: permissionIds.get(key) as string,
      })),
    });
  }

  for (const account of DEMO_ACCOUNTS) {
    const passwordHash = await hash(account.password, 10);
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        name: ROLE_LABELS[account.role],
        passwordHash,
      },
      create: {
        email: account.email,
        name: ROLE_LABELS[account.role],
        passwordHash,
      },
    });

    const role = await prisma.role.findUniqueOrThrow({
      where: { name: account.role },
    });

    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
  }

  console.log(
    'Seed complete:',
    DEMO_ACCOUNTS.map(
      (account) => `${account.email} / ${account.password}`,
    ).join(', '),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
