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

/** 演示项目名称。每次 seed 按名称整块删除再重建，避免累积重复数据。 */
const DEMO_PROJECT_NAME = 'vibe-workflow-console';

type DemoStatus =
  | 'draft'
  | 'ready'
  | 'in_progress'
  | 'review'
  | 'done';

interface DemoVerification {
  command: string;
  result: 'passed' | 'failed';
  evidenceUrl?: string;
  note?: string;
}

interface DemoAiSession {
  title: string;
  tool?: string;
  summary?: string;
}

interface DemoTask {
  title: string;
  status: DemoStatus;
  position: number;
  spec: string | null;
  criteria: string[];
  manualNote?: string;
  /** 从首个状态开始的状态序列，相邻两项生成一条流转记录 */
  history: DemoStatus[];
  /** 验证记录，用于完成门禁的真实数据来源 */
  verifications?: DemoVerification[];
  /** AI 会话记录，用于追溯门禁 */
  aiSessions?: DemoAiSession[];
}

/** 流转备注，按目标状态取文案 */
const TRANSITION_NOTES: Record<DemoStatus, string> = {
  draft: '退回补充规格',
  ready: '规格与验收标准已齐备',
  in_progress: '开始开发',
  review: '开发完成，提交审查',
  done: '验证通过，标记完成',
};

/**
 * 演示任务。状态与历史刻意覆盖以下场景：
 * - 可正常流转；
 * - 规格门禁演示（验证记录台账 / AI 会话台账）；
 * - 已完成规格评审的待开发任务（决策记录）；
 * - 追溯已满足、验证未通过仍被拦（登录与 JWT）；
 * - 完成门禁可达成（完成门禁演示）。
 */
const DEMO_TASKS: DemoTask[] = [
  {
    title: '登录与 JWT',
    status: 'review',
    position: 1,
    spec: '通过邮箱与密码登录，签发 JWT 并在服务端校验；前端持久化 Token、配置路由守卫，未登录访问控制台时回到登录页。',
    criteria: [
      '使用 admin@example.com / admin123 登录后跳转到控制台',
      '未携带或已过期的 Token 访问 /api/auth/me 返回 401',
      '刷新页面后登录状态保持，退出后回到登录页',
    ],
    manualNote:
      '登录链路已用无头浏览器走通：admin 登录后进入控制台，身份卡显示 5 条权限。',
    history: ['draft', 'ready', 'in_progress', 'review'],
    // 只有未通过的验证：追溯已满足，但 review -> done 仍应被验证门禁拦下
    verifications: [
      {
        command: 'pnpm --filter @vibe/server test',
        result: 'failed',
        note: '401 用例失败：已过期 Token 仍能访问 /api/auth/me，需要检查 JwtStrategy 的过期处理。',
      },
    ],
    aiSessions: [
      {
        title: '登录链路排查与 JWT 校验',
        tool: 'Claude Code',
        summary:
          '梳理登录、Token 持久化与路由守卫流程，定位过期 Token 校验缺口并记录待修复项。',
      },
    ],
  },
  {
    title: '规格门禁',
    status: 'in_progress',
    position: 2,
    spec: '在任务从草稿进入待开发、以及从待开发进入进行中之前，校验规格字数与验收标准条数，不足时返回 422 并列出缺口。',
    criteria: [
      '规格不足 20 字时，草稿流转到待开发返回 422 并提示当前字数',
      '规格合格但验收标准只有 2 条时，返回 422 并提示当前条数',
      '规格与 3 条验收标准齐备时允许流转，前端按钮同步变为可用',
    ],
    history: ['draft', 'ready', 'in_progress'],
  },
  {
    title: '验证记录台账',
    status: 'draft',
    position: 3,
    spec: '记录每次验证的任务、执行命令、结果与证据链接，在任务从待审查进入已完成之前要求至少一条通过的验证记录。',
    criteria: [
      '每条验证记录包含任务、执行命令、结果与执行时间',
      '通过的验证记录能在任务详情的时间线中按时间倒序查看',
    ],
    history: [],
  },
  {
    title: 'AI 会话台账',
    status: 'draft',
    position: 4,
    // 故意留空：用于演示规格门禁返回 422
    spec: null,
    criteria: [],
    history: [],
  },
  {
    title: '决策记录',
    status: 'ready',
    position: 5,
    spec: '记录影响交付流程的技术与产品决策，包含背景、候选方案、最终选择以及后续需要复核的条件。',
    criteria: [
      '每条决策记录包含背景、候选方案与最终选择',
      '决策记录关联到具体任务，可在任务详情中查看',
      '被替代的决策保留原文，不就地覆盖',
    ],
    history: ['draft', 'ready'],
  },
  {
    title: '完成门禁演示',
    status: 'review',
    position: 6,
    spec: '演示 review 到 done 的完成门禁：任务需要至少一条通过的验证记录，并且能追溯到一条 AI 会话或不少于 20 字的人工记录。',
    criteria: [
      '任务详情展示通过验证数与追溯状态',
      '补齐一条 passed 验证与一条 AI 会话后，完成按钮变为可用',
      '缺少任一条件时，流转返回 409 并列出全部原因',
    ],
    history: ['draft', 'ready', 'in_progress', 'review'],
    verifications: [
      {
        command: 'pnpm --filter @vibe/server test',
        result: 'passed',
        note: '完成门禁相关用例全部通过，review -> done 的候选流转由服务端判定为可用。',
      },
    ],
    aiSessions: [
      {
        title: '完成门禁联调',
        tool: 'Claude Code',
        summary:
          '补齐验证记录与 AI 会话接口后，联调 review -> done 的放行条件与错误原因展示。',
      },
    ],
  },
];

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

  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@example.com' },
  });

  // 项目下的任务、验收标准与流转记录均为级联删除
  await prisma.project.deleteMany({ where: { name: DEMO_PROJECT_NAME } });

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const baseTime = Date.now();

  const project = await prisma.project.create({
    data: {
      name: DEMO_PROJECT_NAME,
      description: '用它管理这个仓库自己的开发任务',
      // 仓库尚未公开，先留空
      repoUrl: null,
      ownerId: admin.id,
      tasks: {
        create: DEMO_TASKS.map((task) => ({
          title: task.title,
          spec: task.spec,
          manualNote: task.manualNote ?? null,
          status: task.status,
          position: task.position,
          criteria: {
            create: task.criteria.map((content, index) => ({
              content,
              position: index + 1,
            })),
          },
          transitions: {
            create: task.history.slice(1).map((toStatus, index) => ({
              fromStatus: task.history[index],
              toStatus,
              actorId: admin.id,
              note: TRANSITION_NOTES[toStatus],
              // 位置越靠前的任务历史越早，同一任务内按小时递进；
              // +1 保证最新的演示任务也落在过去，不会出现未来时间
              createdAt: new Date(
                baseTime -
                  (DEMO_TASKS.length - task.position + 1) * DAY +
                  index * HOUR,
              ),
            })),
          },
          verifications: {
            create: (task.verifications ?? []).map((verification, index) => ({
              command: verification.command,
              result: verification.result,
              evidenceUrl: verification.evidenceUrl ?? null,
              note: verification.note ?? null,
              createdById: admin.id,
              // 记录排在流转历史之后，按小时递进
              createdAt: new Date(
                baseTime -
                  (DEMO_TASKS.length - task.position + 1) * DAY +
                  (task.history.length + index) * HOUR,
              ),
            })),
          },
          aiSessions: {
            create: (task.aiSessions ?? []).map((session, index) => ({
              title: session.title,
              tool: session.tool ?? null,
              summary: session.summary ?? null,
              createdById: admin.id,
              createdAt: new Date(
                baseTime -
                  (DEMO_TASKS.length - task.position + 1) * DAY +
                  (task.history.length + index) * HOUR,
              ),
            })),
          },
        })),
      },
    },
    include: { tasks: true },
  });

  console.log(
    'Seed complete:',
    DEMO_ACCOUNTS.map(
      (account) => `${account.email} / ${account.password}`,
    ).join(', '),
  );
  console.log(
    `Demo 项目「${project.name}」已重建，包含 ${project.tasks.length} 个任务。`,
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
