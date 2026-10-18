/**
 * Day 3-4 门禁与决策端到端测试。
 *
 * 不引入新依赖：用 Node 内置 fetch 直接打 HTTP，用 NestFactory 在随机端口
 * 启动真实的 AppModule（真实的 Prisma 与 MySQL），覆盖权限、规格门禁、
 * 验证门禁、追溯门禁、决策记录读写与仪表盘汇总，以及删除项目后的级联清理。
 *
 * 运行：pnpm --filter @vibe/server test:e2e
 * 依赖本机 .env 中的 DATABASE_URL（或进程环境变量），测试数据在结束后删除。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../src/prisma/prisma.service';

/** 从仓库根目录的 .env 补齐测试所需环境变量（不覆盖已有值） */
function loadRepoEnv(): void {
  const envPath = resolve(__dirname, '../../../.env');
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    if (process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadRepoEnv();

interface LoginPayload {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
    permissions: string[];
  };
}

interface ProjectPayload {
  id: string;
  name: string;
}

interface TaskGatePayload {
  specLength: number;
  criteriaCount: number;
  specOk: boolean;
  criteriaOk: boolean;
  passedVerifications: number;
  verificationOk: boolean;
  aiSessionCount: number;
  manualNoteLength: number;
  traceabilityOk: boolean;
}

interface TaskDetailPayload {
  id: string;
  status: string;
  gate: TaskGatePayload;
  availableTransitions: Array<{
    to: string;
    allowed: boolean;
    reasons: string[];
  }>;
  transitions: Array<{ fromStatus: string | null; toStatus: string }>;
  verifications: VerificationPayload[];
  aiSessions: AiSessionPayload[];
}

interface UserRefPayload {
  id: string;
  name: string;
}

interface VerificationPayload {
  id: string;
  taskId: string;
  command: string;
  result: 'passed' | 'failed';
  evidenceUrl: string | null;
  note: string | null;
  createdBy: UserRefPayload | null;
  createdAt: string;
}

interface AiSessionPayload {
  id: string;
  taskId: string;
  title: string;
  tool: string | null;
  summary: string | null;
  createdBy: UserRefPayload | null;
  createdAt: string;
}

interface DecisionSummaryPayload {
  id: string;
  projectId: string;
  taskId: string | null;
  title: string;
  status: string;
  project: { id: string; name: string };
  task: { id: string; title: string } | null;
  createdBy: UserRefPayload | null;
  createdAt: string;
  updatedAt: string;
}

interface DecisionDetailPayload extends DecisionSummaryPayload {
  context: string;
  options: string;
  decision: string;
  consequences: string | null;
}

interface DashboardSummaryPayload {
  generatedAt: string;
  totals: {
    projects: number;
    tasks: number;
    decisions: number;
    aiSessions: number;
  };
  statusCounts: Record<string, number>;
  verification: {
    total: number;
    passed: number;
    failed: number;
    passRate: number | null;
  };
  blocked: {
    spec: TaskRefPayload[];
    verification: TaskRefPayload[];
    traceability: TaskRefPayload[];
  };
}

interface TaskRefPayload {
  id: string;
  title: string;
  project: { id: string; name: string };
}

interface ErrorPayload {
  message: string | string[];
  code?: string;
  reasons?: string[];
}

interface ApiResponse<T> {
  status: number;
  body: T;
  text: string;
}

async function call<T = unknown>(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
  } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();

  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { status: response.status, body: body as T, text };
}

/** 决策记录创建请求的公共字段 */
const decisionBody = {
  title: 'E2E 决策记录',
  context: '端到端测试需要覆盖决策记录的创建、摘要列表、详情与状态更新。',
  options: 'A. 只覆盖详情；B. 覆盖完整生命周期。',
  decision: '覆盖完整生命周期，确保摘要与详情字段口径一致。',
};

describe('Day 3-4 门禁与决策 E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  let adminToken: string;
  let viewerToken: string;
  let projectId: string;
  let projectName: string;
  let taskId: string;
  let verificationId: string;
  let aiSessionId: string;
  let emptyTaskDecisionId: string;
  let decisionId: string;
  const extraProjectIds: string[] = [];

  beforeAll(async () => {
    // 动态导入放在环境变量补齐之后，确保 Prisma 拿到 DATABASE_URL
    const { AppModule } = await import('../src/app.module');

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.listen(0);

    // listen(0) 由系统分配随机端口，避免与 3010 / 5173 上已运行的服务冲突
    const address = app.getHttpServer().address();
    if (address === null || typeof address === 'string') {
      throw new Error('无法获取 E2E 服务的随机端口');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);

    const adminLogin = await call<LoginPayload>(baseUrl, '/auth/login', {
      method: 'POST',
      body: { email: 'admin@example.com', password: 'admin123' },
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.accessToken;

    const viewerLogin = await call<LoginPayload>(baseUrl, '/auth/login', {
      method: 'POST',
      body: { email: 'viewer@example.com', password: 'viewer123' },
    });
    expect(viewerLogin.status).toBe(200);
    viewerToken = viewerLogin.body.accessToken;

    expect(adminLogin.body.user.permissions).toContain('task:write');
    expect(viewerLogin.body.user.permissions).not.toContain('task:write');
  });

  afterAll(async () => {
    // 测试失败时也清理临时项目，项目下的任务与记录按外键级联删除
    if (prisma) {
      if (projectId) {
        await prisma.project
          .deleteMany({ where: { id: projectId } })
          .catch(() => undefined);
      }
      for (const id of extraProjectIds) {
        await prisma.project
          .deleteMany({ where: { id } })
          .catch(() => undefined);
      }
    }
    if (app) {
      await app.close();
    }
  });

  it('健康检查返回 200', async () => {
    const response = await call<{ status: string; db: string }>(
      baseUrl,
      '/health',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('无 token 访问项目列表返回 401', async () => {
    const response = await call<ErrorPayload>(baseUrl, '/projects');
    expect(response.status).toBe(401);
  });

  it('viewer 创建项目返回 403', async () => {
    const response = await call<ErrorPayload>(baseUrl, '/projects', {
      method: 'POST',
      token: viewerToken,
      body: { name: `e2e-viewer-${Date.now()}` },
    });
    expect(response.status).toBe(403);
    expect(response.text).not.toContain('passwordHash');
  });

  it('admin 创建项目与任务', async () => {
    const project = await call<ProjectPayload>(baseUrl, '/projects', {
      method: 'POST',
      token: adminToken,
      body: { name: `e2e-gates-${Date.now()}` },
    });
    expect(project.status).toBe(201);
    expect(project.body.id).toBeTruthy();
    projectId = project.body.id;
    projectName = project.body.name;

    // 规格刻意写短、验收标准不足，用来触发规格门禁
    const task = await call<TaskDetailPayload>(
      baseUrl,
      `/projects/${projectId}/tasks`,
      {
        method: 'POST',
        token: adminToken,
        body: {
          title: '完成门禁演示',
          spec: '规格太短',
          acceptanceCriteria: ['第一条', '第二条'],
        },
      },
    );
    expect(task.status).toBe(201);
    expect(task.text).not.toContain('passwordHash');
    taskId = task.body.id;

    expect(task.body.gate.specOk).toBe(false);
    expect(task.body.gate.criteriaOk).toBe(false);
  });

  it('viewer 不能写决策，但可以读取决策列表', async () => {
    const write = await call<ErrorPayload>(
      baseUrl,
      `/projects/${projectId}/decisions`,
      {
        method: 'POST',
        token: viewerToken,
        body: decisionBody,
      },
    );
    expect(write.status).toBe(403);

    const read = await call<DecisionSummaryPayload[]>(baseUrl, '/decisions', {
      token: viewerToken,
    });
    expect(read.status).toBe(200);
    expect(Array.isArray(read.body)).toBe(true);
  });

  it('短规格 draft -> ready 返回 422 SPEC_GATE', async () => {
    const response = await call<ErrorPayload>(
      baseUrl,
      `/tasks/${taskId}/transitions`,
      {
        method: 'POST',
        token: adminToken,
        body: { to: 'ready' },
      },
    );
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('SPEC_GATE');
    expect(response.body.reasons).toHaveLength(2);
    expect(response.text).not.toContain('passwordHash');
  });

  it('补齐规格后推进到 review', async () => {
    const update = await call<TaskDetailPayload>(
      baseUrl,
      `/tasks/${taskId}`,
      {
        method: 'PATCH',
        token: adminToken,
        body: {
          spec: '验证记录与 AI 会话落地后，review 到 done 需要至少一条通过的验证，并满足追溯要求。',
        },
      },
    );
    expect(update.status).toBe(200);

    const criteria = await call<TaskDetailPayload>(
      baseUrl,
      `/tasks/${taskId}/criteria`,
      {
        method: 'PUT',
        token: adminToken,
        body: {
          items: [
            '缺少通过的验证时 review -> done 返回 409',
            '补齐验证与会话后 review -> done 返回 200',
            '删除项目后验证与会话记录级联删除',
          ],
        },
      },
    );
    expect(criteria.status).toBe(200);
    expect(criteria.body.gate.specOk).toBe(true);
    expect(criteria.body.gate.criteriaOk).toBe(true);

    for (const to of ['ready', 'in_progress', 'review']) {
      const transition = await call<TaskDetailPayload>(
        baseUrl,
        `/tasks/${taskId}/transitions`,
        {
          method: 'POST',
          token: adminToken,
          body: { to },
        },
      );
      expect(transition.status).toBe(200);
      expect(transition.body.status).toBe(to);
    }
  });

  it('缺验证时 review -> done 返回 409，reasons 同时列出验证与追溯', async () => {
    const response = await call<ErrorPayload>(
      baseUrl,
      `/tasks/${taskId}/transitions`,
      {
        method: 'POST',
        token: adminToken,
        body: { to: 'done' },
      },
    );
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VERIFICATION_GATE');
    expect(response.body.reasons).toHaveLength(2);
  });

  it('只有 failed 验证时仍被验证门禁拦下', async () => {
    const failed = await call<VerificationPayload>(
      baseUrl,
      `/tasks/${taskId}/verifications`,
      {
        method: 'POST',
        token: adminToken,
        body: {
          command: 'pnpm --filter @vibe/server test',
          result: 'failed',
          note: '401 用例失败，token 过期逻辑未覆盖',
        },
      },
    );
    expect(failed.status).toBe(201);
    expect(failed.body.result).toBe('failed');
    expect(failed.body.createdBy?.name).toBeTruthy();
    expect(failed.text).not.toContain('passwordHash');
    verificationId = failed.body.id;

    // 补一条 AI 会话，让追溯条件先满足，验证门禁单独暴露出来
    const session = await call<AiSessionPayload>(
      baseUrl,
      `/tasks/${taskId}/ai-sessions`,
      {
        method: 'POST',
        token: adminToken,
        body: {
          title: '排查 401 用例',
          tool: 'Claude Code',
          summary: '定位未覆盖的 token 过期分支。',
        },
      },
    );
    expect(session.status).toBe(201);
    expect(session.body.createdBy?.name).toBeTruthy();
    expect(session.text).not.toContain('passwordHash');
    aiSessionId = session.body.id;

    const detail = await call<TaskDetailPayload>(
      baseUrl,
      `/tasks/${taskId}`,
      { token: adminToken },
    );
    expect(detail.status).toBe(200);
    expect(detail.body.gate.passedVerifications).toBe(0);
    expect(detail.body.gate.verificationOk).toBe(false);
    expect(detail.body.gate.aiSessionCount).toBe(1);
    expect(detail.body.gate.traceabilityOk).toBe(true);
    expect(detail.body.verifications).toHaveLength(1);
    expect(detail.body.aiSessions).toHaveLength(1);

    const transition = await call<ErrorPayload>(
      baseUrl,
      `/tasks/${taskId}/transitions`,
      {
        method: 'POST',
        token: adminToken,
        body: { to: 'done' },
      },
    );
    expect(transition.status).toBe(409);
    expect(transition.body.code).toBe('VERIFICATION_GATE');
    expect(transition.body.reasons).toHaveLength(1);
  });

  it('补齐 passed 验证后 review -> done 返回 200', async () => {
    const passed = await call<VerificationPayload>(
      baseUrl,
      `/tasks/${taskId}/verifications`,
      {
        method: 'POST',
        token: adminToken,
        body: {
          command: 'pnpm --filter @vibe/server test',
          result: 'passed',
          evidenceUrl: 'https://example.com/ci/runs/1',
          note: '全部用例通过',
        },
      },
    );
    expect(passed.status).toBe(201);
    expect(passed.body.result).toBe('passed');
    expect(passed.body.evidenceUrl).toBe('https://example.com/ci/runs/1');

    const list = await call<VerificationPayload[]>(
      baseUrl,
      `/tasks/${taskId}/verifications`,
      { token: adminToken },
    );
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);

    const transition = await call<TaskDetailPayload>(
      baseUrl,
      `/tasks/${taskId}/transitions`,
      {
        method: 'POST',
        token: adminToken,
        body: { to: 'done' },
      },
    );
    expect(transition.status).toBe(200);
    expect(transition.body.status).toBe('done');
    expect(transition.body.gate.passedVerifications).toBe(1);
    expect(transition.body.gate.verificationOk).toBe(true);
    expect(transition.body.gate.traceabilityOk).toBe(true);
    expect(transition.body.availableTransitions).toHaveLength(0);
    expect(
      transition.body.transitions.some(
        (item) => item.fromStatus === 'review' && item.toStatus === 'done',
      ),
    ).toBe(true);
    expect(transition.text).not.toContain('passwordHash');
  });

  it('决策记录：空 taskId 落为 null，跨项目任务返回 400', async () => {
    const empty = await call<DecisionDetailPayload>(
      baseUrl,
      `/projects/${projectId}/decisions`,
      {
        method: 'POST',
        token: adminToken,
        body: { ...decisionBody, taskId: '' },
      },
    );
    expect(empty.status).toBe(201);
    expect(empty.body.taskId).toBeNull();
    emptyTaskDecisionId = empty.body.id;

    // 另一个项目下的任务不能作为本项目的关联任务
    const otherProject = await call<ProjectPayload>(baseUrl, '/projects', {
      method: 'POST',
      token: adminToken,
      body: { name: `e2e-other-${Date.now()}` },
    });
    expect(otherProject.status).toBe(201);
    extraProjectIds.push(otherProject.body.id);

    const otherTask = await call<TaskDetailPayload>(
      baseUrl,
      `/projects/${otherProject.body.id}/tasks`,
      {
        method: 'POST',
        token: adminToken,
        body: { title: '其他项目的任务' },
      },
    );
    expect(otherTask.status).toBe(201);

    const crossProject = await call<ErrorPayload>(
      baseUrl,
      `/projects/${projectId}/decisions`,
      {
        method: 'POST',
        token: adminToken,
        body: { ...decisionBody, taskId: otherTask.body.id },
      },
    );
    expect(crossProject.status).toBe(400);
    expect(crossProject.text).not.toContain('passwordHash');
  });

  it('决策记录：摘要列表、详情、状态更新与重复删除', async () => {
    const created = await call<DecisionDetailPayload>(
      baseUrl,
      `/projects/${projectId}/decisions`,
      {
        method: 'POST',
        token: adminToken,
        body: { ...decisionBody, taskId },
      },
    );
    expect(created.status).toBe(201);
    expect(created.body.taskId).toBe(taskId);
    expect(created.body.context).toBe(decisionBody.context);
    decisionId = created.body.id;

    // 列表只返回摘要，不读取正文列，但保留项目与任务引用
    const list = await call<DecisionSummaryPayload[]>(
      baseUrl,
      `/decisions?projectId=${projectId}`,
      { token: adminToken },
    );
    expect(list.status).toBe(200);
    const summary = list.body.find((item) => item.id === decisionId);
    expect(summary).toBeDefined();
    expect(summary).not.toHaveProperty('context');
    expect(summary).not.toHaveProperty('options');
    expect(summary).not.toHaveProperty('decision');
    expect(summary?.project).toEqual({ id: projectId, name: projectName });
    expect(summary?.task).toEqual({ id: taskId, title: '完成门禁演示' });

    const detail = await call<DecisionDetailPayload>(
      baseUrl,
      `/decisions/${decisionId}`,
      { token: adminToken },
    );
    expect(detail.status).toBe(200);
    expect(detail.body.context).toBe(decisionBody.context);
    expect(detail.body.options).toBe(decisionBody.options);

    const patched = await call<DecisionDetailPayload>(
      baseUrl,
      `/decisions/${decisionId}`,
      {
        method: 'PATCH',
        token: adminToken,
        body: { status: 'accepted' },
      },
    );
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('accepted');

    const removed = await call(baseUrl, `/decisions/${decisionId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(removed.status).toBe(204);

    const removedAgain = await call<ErrorPayload>(
      baseUrl,
      `/decisions/${decisionId}`,
      { method: 'DELETE', token: adminToken },
    );
    expect(removedAgain.status).toBe(404);
    decisionId = '';
  });

  it('仪表盘汇总返回五态计数、一致总量与临时项目的阻塞任务', async () => {
    const fullSpec =
      '仪表盘端到端测试需要一条足够长的任务规格，用来进入阻塞列表并校验汇总口径。';
    const criteria = ['第一条验收标准', '第二条验收标准', '第三条验收标准'];

    // 待开发状态但规格不足：进入 spec 阻塞列表
    const specTask = await call<TaskDetailPayload>(
      baseUrl,
      `/projects/${projectId}/tasks`,
      {
        method: 'POST',
        token: adminToken,
        body: { title: '仪表盘规格阻塞', spec: fullSpec, acceptanceCriteria: criteria },
      },
    );
    expect(specTask.status).toBe(201);
    const specBlockedTaskId = specTask.body.id;

    const specReady = await call<TaskDetailPayload>(
      baseUrl,
      `/tasks/${specBlockedTaskId}/transitions`,
      { method: 'POST', token: adminToken, body: { to: 'ready' } },
    );
    expect(specReady.status).toBe(200);

    const shortened = await call<TaskDetailPayload>(
      baseUrl,
      `/tasks/${specBlockedTaskId}`,
      { method: 'PATCH', token: adminToken, body: { spec: '太短' } },
    );
    expect(shortened.status).toBe(200);
    expect(shortened.body.gate.specOk).toBe(false);

    // 待审查但缺少验证与追溯：进入 verification / traceability 阻塞列表
    const reviewTask = await call<TaskDetailPayload>(
      baseUrl,
      `/projects/${projectId}/tasks`,
      {
        method: 'POST',
        token: adminToken,
        body: { title: '仪表盘验证阻塞', spec: fullSpec, acceptanceCriteria: criteria },
      },
    );
    expect(reviewTask.status).toBe(201);
    const reviewBlockedTaskId = reviewTask.body.id;

    for (const to of ['ready', 'in_progress', 'review']) {
      const transition = await call<TaskDetailPayload>(
        baseUrl,
        `/tasks/${reviewBlockedTaskId}/transitions`,
        { method: 'POST', token: adminToken, body: { to } },
      );
      expect(transition.status).toBe(200);
    }

    const summary = await call<DashboardSummaryPayload>(
      baseUrl,
      '/dashboard/summary',
      { token: adminToken },
    );
    expect(summary.status).toBe(200);

    expect(Object.keys(summary.body.statusCounts).sort()).toEqual(
      ['draft', 'done', 'in_progress', 'ready', 'review'].sort(),
    );
    const statusSum = Object.values(summary.body.statusCounts).reduce(
      (total, count) => total + count,
      0,
    );
    expect(summary.body.totals.tasks).toBe(statusSum);

    const { total, passed, failed, passRate } = summary.body.verification;
    expect(failed).toBe(total - passed);
    if (total === 0) {
      expect(passRate).toBeNull();
    } else {
      expect(passRate).toBeCloseTo(passed / total, 5);
    }

    expect(summary.body.totals.projects).toBeGreaterThanOrEqual(1);
    expect(summary.body.totals.decisions).toBeGreaterThanOrEqual(1);
    expect(summary.body.totals.aiSessions).toBeGreaterThanOrEqual(1);

    const projectBlocked = (refs: TaskRefPayload[]) =>
      refs.filter((ref) => ref.project.id === projectId);

    expect(projectBlocked(summary.body.blocked.spec).map((ref) => ref.id)).toContain(
      specBlockedTaskId,
    );
    expect(
      projectBlocked(summary.body.blocked.verification).map((ref) => ref.id),
    ).toContain(reviewBlockedTaskId);
    expect(
      projectBlocked(summary.body.blocked.traceability).map((ref) => ref.id),
    ).toContain(reviewBlockedTaskId);
  });

  it('删除项目后验证、会话与决策记录级联消失', async () => {
    // 删除前临时项目仍保留一条决策，确保下面的 0 不是空集
    expect(emptyTaskDecisionId).toBeTruthy();
    expect(
      await prisma.decision.count({ where: { projectId } }),
    ).toBeGreaterThan(0);

    const removed = await call(baseUrl, `/projects/${projectId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(removed.status).toBe(204);

    // 直接查库确认不是接口隐藏，而是行真的被级联删除
    expect(
      await prisma.task.count({ where: { id: taskId } }),
    ).toBe(0);
    expect(
      await prisma.verification.count({ where: { id: verificationId } }),
    ).toBe(0);
    expect(
      await prisma.aiSession.count({ where: { id: aiSessionId } }),
    ).toBe(0);
    expect(
      await prisma.decision.count({ where: { projectId } }),
    ).toBe(0);
    expect(
      await prisma.decision.count({ where: { id: emptyTaskDecisionId } }),
    ).toBe(0);

    // 项目已删除，afterAll 无需再清理
    projectId = '';
  });
});
