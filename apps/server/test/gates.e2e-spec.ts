/**
 * Day 3 门禁端到端测试。
 *
 * 不引入新依赖：用 Node 内置 fetch 直接打 HTTP，用 NestFactory 在随机端口
 * 启动真实的 AppModule（真实的 Prisma 与 MySQL），覆盖权限、规格门禁、
 * 验证门禁、追溯门禁以及删除项目后的级联清理。
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

describe('Day 3 门禁 E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  let adminToken: string;
  let viewerToken: string;
  let projectId: string;
  let taskId: string;
  let verificationId: string;
  let aiSessionId: string;

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
    if (prisma && projectId) {
      await prisma.project
        .deleteMany({ where: { id: projectId } })
        .catch(() => undefined);
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

  it('删除项目后验证记录与会话记录级联消失', async () => {
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

    // 项目已删除，afterAll 无需再清理
    projectId = '';
  });
});
