import { PrismaClient } from '@prisma/client';
import { PERMISSION_LIST, ROLE_PRESETS, type RoleName } from '@vibe/shared';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

/** 仅本地开发使用的固定账号；生产账号由环境变量提供，见 resolveAccounts。 */
const DEV_ACCOUNTS: ReadonlyArray<{
  role: RoleName;
  email: string;
  password: string;
}> = [
  { role: 'admin', email: 'admin@example.com', password: 'admin123' },
  { role: 'editor', email: 'editor@example.com', password: 'editor123' },
  { role: 'viewer', email: 'viewer@example.com', password: 'viewer123' },
];

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

interface DemoDecision {
  title: string;
  context: string;
  options: string;
  decision: string;
  consequences?: string;
  status: 'proposed' | 'accepted' | 'superseded';
  /** 关联任务标题，任务不存在时留空 */
  taskTitle?: string;
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
    aiSessions: [
      {
        title: '决策记录字段设计',
        tool: 'Claude Code',
        summary:
          '讨论决策记录需要保存背景、候选方案、最终选择与后续复核条件，并确定关联任务的可选关系。',
      },
    ],
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
  {
    title: '任务看板',
    status: 'in_progress',
    position: 7,
    spec: '按五种状态分列展示任务卡片，卡片显示标题、所属项目、验收标准条数与更新时间；支持按项目与关键字筛选，从仪表盘进入时可只显示单个状态列。',
    criteria: [
      '看板固定五列，列内按更新时间倒序展示任务卡片',
      '卡片显示标题、项目名、验收标准条数与更新时间',
      '项目下拉与关键字输入可组合筛选，清空后恢复全部任务',
    ],
    history: ['draft', 'ready', 'in_progress'],
    aiSessions: [
      {
        title: '看板布局与筛选联调',
        tool: 'Claude Code',
        summary:
          '确定五列看板的宽度与横向滚动边界，实现项目与关键字组合筛选并处理空列状态。',
      },
    ],
  },
  {
    title: '仪表盘统计',
    status: 'ready',
    position: 8,
    spec: '仪表盘展示任务总数、待审查数量、验证通过率与决策记录数，按状态分布展示任务数量，并列出规格、验证、追溯三组阻塞任务。',
    criteria: [
      '四张统计卡片的数据与任务、验证、决策接口一致',
      '状态分布展示五种状态的数量，无验证记录时通过率显示为不可计算',
      '三组阻塞任务均可点击跳转到对应任务详情',
    ],
    history: ['draft', 'ready'],
  },
  {
    title: 'E2E 回归',
    status: 'done',
    position: 9,
    spec: 'E2E 覆盖登录、项目创建、任务流转与完成门禁，每次提交在 CI 中执行；失败时保留截图与日志，便于定位回归问题。',
    criteria: [
      'E2E 用例覆盖登录、项目创建与任务完整流转',
      'CI 中 E2E 失败时保留截图与运行日志',
      '全部用例在本地与 CI 均能稳定通过',
    ],
    history: ['draft', 'ready', 'in_progress', 'review', 'done'],
    verifications: [
      {
        command: 'pnpm --filter @vibe/server test',
        result: 'passed',
        note: '服务端单元测试全部通过；仓库当前没有覆盖登录与任务流转的 E2E 用例。',
      },
    ],
    aiSessions: [
      {
        title: 'E2E 用例补齐与回归',
        tool: 'Claude Code',
        summary:
          '补齐任务流转与完成门禁用例，修复选择器不稳定导致的偶发失败。',
      },
    ],
  },
  {
    title: '看板筛选',
    status: 'review',
    position: 10,
    spec: '看板支持从仪表盘携带 ?status= 参数进入，此时只展示该状态列并提供返回完整看板的入口；项目与关键字筛选即时生效，页面本身不出现横向滚动。',
    criteria: [
      '带 ?status=review 进入时只显示待审查列，并有返回完整看板的链接',
      '切换项目或关键字后筛选结果即时更新，清空后恢复全部任务',
      '390、760、1280 宽度下页面均无横向滚动',
    ],
    // 追溯门禁的真实阻塞示例：没有 AI 会话，人工记录也不足 20 字
    manualNote: '筛选交互已人工走查',
    history: ['draft', 'ready', 'in_progress', 'review'],
    verifications: [
      {
        command: '手动验证：看板筛选',
        result: 'passed',
        note: '看板筛选已人工走查，390/760/1280px 均无横向滚动。',
      },
    ],
  },
];

/**
 * 演示决策记录。按任务标题关联，三份记录分别覆盖：
 * 已接受的门禁位置选择、已接受的事务内条件写、待评审的 E2E 选型。
 */
const DEMO_DECISIONS: DemoDecision[] = [
  {
    title: '门禁逻辑为什么放在 packages/shared',
    taskTitle: '完成门禁演示',
    status: 'accepted',
    context:
      '规格、验证与追溯三道门禁既要在后端拦截流转，也要在前端提前展示按钮可用性与缺口原因。最初前后端各写一份判断，导致字数口径与提示文案逐渐不一致。',
    options: [
      '后端维护门禁判断，前端只展示接口返回的结果',
      '前后端各写一份判断，靠测试保证一致',
      '把纯函数门禁抽到 packages/shared，前后端共用',
    ].join('\n'),
    decision:
      '在 packages/shared 中实现 summarizeSpecGate 与 summarizeCompletionGate 等纯函数，后端流转与前端展示调用同一份实现。',
    consequences:
      '门禁口径只有一处，修改规则时前端提示同步生效；代价是 shared 需要保持无框架依赖，构建顺序上必须先于 server 与 web。',
  },
  {
    title: '状态流转为什么用事务内条件写',
    taskTitle: '任务看板',
    status: 'accepted',
    context:
      '状态流转需要先读取任务与门禁数据、再写流转记录和任务状态。并发请求下，先读后写会把同一条任务从 review 同时流转到 done 和 in_progress，产生两条出边。',
    options: [
      '读取后直接更新，靠前端按钮防重复点击',
      '对任务行加锁后再判断并更新',
      '把门禁判定与条件更新放进同一事务，按原状态做条件写',
    ].join('\n'),
    decision:
      '在事务内以原状态作为更新条件执行 updateMany，只有命中一条时才写入流转记录；未命中返回 409。',
    consequences:
      '并发流转只有一个请求成功，历史记录保持单条出边；代价是冲突时需要返回明确的提示，前端要处理 409 而不是重试。',
  },
  {
    title: 'E2E 为什么不引入 supertest',
    status: 'proposed',
    context:
      '现有 E2E 用例通过真实 HTTP 请求覆盖登录、项目与任务流转。为了直接调用 Nest 应用实例，讨论过引入 supertest 以减少启动开销。',
    options: [
      '引入 supertest，在进程内调用 Nest 应用',
      '保持现有真实 HTTP 请求的写法',
      '只保留单元测试，取消 E2E',
    ].join('\n'),
    decision:
      '当前保持真实 HTTP 请求，不新增依赖；如果后续用例数量增长导致启动时间明显变长，再评估 supertest。',
    consequences:
      '不引入新依赖，E2E 与生产请求路径一致；代价是用例执行需要先启动服务，CI 中的等待时间更长。',
  },
];

interface SeedAccount {
  role: RoleName;
  email: string;
  password: string;
  /** 生产环境不覆盖管理员的已有密码，避免每日重置把改过的密码重置回环境变量 */
  updatePassword: boolean;
}

/**
 * 本地与 CI 使用固定的 demo 账号，保证 E2E 可重复。
 * 生产只创建两个账号：管理员（密码来自 ADMIN_PASSWORD，不公开）与
 * 对外演示账号（密码来自 DEMO_PASSWORD，会显示在登录页）。
 */
function resolveAccounts(isProduction: boolean): SeedAccount[] {
  if (!isProduction) {
    return DEV_ACCOUNTS.map((account) => ({
      ...account,
      updatePassword: true,
    }));
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const demoEmail = process.env.DEMO_EMAIL ?? 'demo@vibe.local';
  const demoPassword = process.env.DEMO_PASSWORD;

  if (!adminEmail || !adminPassword || !demoPassword) {
    throw new Error(
      'Production seed 需要 ADMIN_EMAIL、ADMIN_PASSWORD、DEMO_PASSWORD（可选 DEMO_EMAIL）。',
    );
  }
  if (adminPassword.length < 16 || demoPassword.length < 12) {
    throw new Error(
      'ADMIN_PASSWORD 至少 16 位，DEMO_PASSWORD 至少 12 位。',
    );
  }

  return [
    {
      role: 'admin',
      email: adminEmail,
      password: adminPassword,
      updatePassword: false,
    },
    {
      role: 'editor',
      email: demoEmail,
      password: demoPassword,
      updatePassword: true,
    },
  ];
}

async function main(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const accounts = resolveAccounts(isProduction);
  const adminEmail = isProduction
    ? (process.env.ADMIN_EMAIL as string)
    : 'admin@example.com';

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

  for (const account of accounts) {
    const passwordHash = await hash(account.password, 10);
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: account.updatePassword
        ? { name: ROLE_LABELS[account.role], passwordHash }
        : { name: ROLE_LABELS[account.role] },
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
    where: { email: adminEmail },
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
      // 项目先于全部任务存在，更新时间保持在基准时间
      createdAt: new Date(baseTime - (DEMO_TASKS.length + 3) * DAY),
      updatedAt: new Date(baseTime),
      tasks: {
        create: DEMO_TASKS.map((task) => ({
          title: task.title,
          spec: task.spec,
          manualNote: task.manualNote ?? null,
          status: task.status,
          position: task.position,
          // 任务晚于项目创建、早于各自的全部流转与记录
          createdAt: new Date(
            baseTime - (DEMO_TASKS.length - task.position + 1) * DAY - HOUR,
          ),
          updatedAt: new Date(
            baseTime - (DEMO_TASKS.length - task.position) * DAY,
          ),
          criteria: {
            create: task.criteria.map((content, index) => ({
              content,
              position: index + 1,
              // 验收标准在任务创建之后、任务更新之前
              createdAt: new Date(
                baseTime - (DEMO_TASKS.length - task.position + 1) * DAY,
              ),
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

  const taskByTitle = new Map(project.tasks.map((task) => [task.title, task]));

  // 决策记录排在任务之后，按天递进且全部落在过去
  const decisions = await prisma.decision.createMany({
    data: DEMO_DECISIONS.map((decision, index) => {
      let taskId: string | null = null;
      if (decision.taskTitle) {
        const task = taskByTitle.get(decision.taskTitle);
        if (!task) {
          throw new Error(
            `演示决策「${decision.title}」关联的任务「${decision.taskTitle}」不存在`,
          );
        }
        taskId = task.id;
      }

      const createdAt = new Date(
        baseTime - (DEMO_DECISIONS.length - index + 1) * DAY,
      );

      return {
        projectId: project.id,
        taskId,
        title: decision.title,
        context: decision.context,
        options: decision.options,
        decision: decision.decision,
        consequences: decision.consequences ?? null,
        status: decision.status,
        createdById: admin.id,
        createdAt,
        updatedAt: createdAt,
      };
    }),
  });

  if (isProduction) {
    console.log(
      `Seed complete: 生产账号已就绪（admin: ${adminEmail}，demo: ${accounts.find((a) => a.role === 'editor')?.email}）。密码不写入日志。`,
    );
  } else {
    console.log(
      'Seed complete:',
      accounts.map((account) => `${account.email} / ${account.password}`).join(', '),
    );
  }
  console.log(
    `Demo 项目「${project.name}」已重建，包含 ${project.tasks.length} 个任务、${decisions.count} 条决策记录。`,
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
