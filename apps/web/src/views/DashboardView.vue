<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { fetchHealth } from '@/api/health';

const auth = useAuthStore();
const router = useRouter();

type HealthState = 'checking' | 'ok' | 'down';
const health = ref<HealthState>('checking');
const healthDetail = ref('正在检查 /api/health');

onMounted(async () => {
  try {
    const result = await fetchHealth();
    health.value = result.status === 'ok' ? 'ok' : 'down';
    healthDetail.value = `API ${result.status} · DB ${result.db}`;
  } catch {
    health.value = 'down';
    healthDetail.value = '无法连接 API，请确认服务端已启动';
  }
});

const checklist = [
  {
    title: '登录与 JWT',
    detail: 'POST /api/auth/login 返回 token，受保护接口校验 Bearer',
    done: true,
  },
  {
    title: '角色与权限',
    detail: 'v-permission 指令 + 路由 meta.permission 已生效，viewer 看不到写操作',
    done: true,
  },
  {
    title: '项目与任务',
    detail: 'Project / Task 列表、详情、验收标准编辑与状态流转时间线',
    done: true,
  },
  {
    title: '规格门禁',
    detail: '规格至少 20 字且至少 3 条验收标准才能进入待开发，API 422 拦截',
    done: true,
  },
  {
    title: '验证门禁',
    detail: '还没有 Verification 模型，review → done 恒被 409 拦下',
    done: false,
  },
  {
    title: '追溯记录',
    detail: '还没有 AI 会话模型，当前只能靠人工记录满足追溯门禁',
    done: false,
  },
];

const nextSteps = [
  '验证记录：unit / e2e / manual 三种',
  'AI 会话台账与决策记录',
  'review → done 的验证与追溯门禁',
  '任务看板与跨项目筛选',
];
</script>

<template>
  <div class="dashboard">
    <header class="page-head">
      <div>
        <p class="eyebrow">Day 2 · Flow &amp; Gates</p>
        <h1>交付控制台</h1>
        <p class="sub">
          欢迎，{{ auth.user?.name ?? '开发者' }}。项目与任务已经串起来，
          规格门禁跑通；验证与追溯门禁还缺数据模型，暂时不会把它们标成已完成。
        </p>
      </div>
      <div class="head-side">
        <el-button type="primary" @click="router.push('/projects')">
          查看项目
        </el-button>
        <el-tag class="day-tag" effect="dark" type="primary">Day 2</el-tag>
      </div>
    </header>

    <section class="cards">
      <el-card class="card" shadow="never">
        <template #header>
          <div class="card-head">
            <span>当前身份</span>
            <span class="card-kicker">auth/me</span>
          </div>
        </template>

        <div v-if="auth.user" class="identity">
          <div class="identity-row">
            <span class="label">姓名</span>
            <strong>{{ auth.user.name }}</strong>
          </div>
          <div class="identity-row">
            <span class="label">邮箱</span>
            <span>{{ auth.user.email }}</span>
          </div>
          <div class="identity-row">
            <span class="label">角色</span>
            <div class="tags">
              <el-tag
                v-for="role in auth.user.roles"
                :key="role"
                size="small"
                effect="plain"
              >
                {{ role }}
              </el-tag>
            </div>
          </div>
          <div class="identity-row permissions">
            <span class="label">权限</span>
            <div class="tags">
              <el-tag
                v-for="permission in auth.user.permissions"
                :key="permission"
                size="small"
                type="info"
                effect="plain"
              >
                {{ permission }}
              </el-tag>
            </div>
          </div>
        </div>
      </el-card>

      <el-card class="card" shadow="never">
        <template #header>
          <div class="card-head">
            <span>系统状态</span>
            <span class="card-kicker">/api/health</span>
          </div>
        </template>

        <div class="health">
          <span
            class="health-dot"
            :class="{
              ok: health === 'ok',
              down: health === 'down',
              checking: health === 'checking',
            }"
          />
          <div>
            <strong>
              {{
                health === 'ok'
                  ? '运行正常'
                  : health === 'down'
                    ? '连接失败'
                    : '检查中'
              }}
            </strong>
            <p>{{ healthDetail }}</p>
          </div>
        </div>

        <div class="stack">
          <div class="stack-row">
            <span>前端</span>
            <code>Vue 3 + Vite + Element Plus</code>
          </div>
          <div class="stack-row">
            <span>服务端</span>
            <code>NestJS + Prisma</code>
          </div>
          <div class="stack-row">
            <span>数据库</span>
            <code>MySQL 8</code>
          </div>
        </div>
      </el-card>
    </section>

    <section class="cards lower">
      <el-card class="card" shadow="never">
        <template #header>
          <div class="card-head">
            <span>当前进度</span>
            <span class="card-kicker">{{ checklist.filter((item) => item.done).length }}/{{ checklist.length }}</span>
          </div>
        </template>

        <ul class="checklist">
          <li v-for="item in checklist" :key="item.title" :class="{ done: item.done }">
            <span class="check" aria-hidden="true">{{ item.done ? '✓' : '·' }}</span>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.detail }}</p>
            </div>
            <el-tag
              size="small"
              :type="item.done ? 'success' : 'info'"
              effect="plain"
            >
              {{ item.done ? '已跑通' : '未实现' }}
            </el-tag>
          </li>
        </ul>
      </el-card>

      <el-card class="card next-card" shadow="never">
        <template #header>
          <div class="card-head">
            <span>接下来</span>
            <span class="card-kicker">Day 2–3</span>
          </div>
        </template>

        <ol class="next-list">
          <li v-for="(step, index) in nextSteps" :key="step">
            <span>{{ String(index + 1).padStart(2, '0') }}</span>
            <p>{{ step }}</p>
          </li>
        </ol>

        <p class="next-note">
          规格门禁已经跑通；验证门禁和追溯记录在数据模型落地前，
          会一直显示为未实现。
        </p>
      </el-card>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: grid;
  gap: 22px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #2f6fed;
}

h1 {
  margin: 0;
  font-size: 30px;
  letter-spacing: -0.02em;
  color: #18202f;
}

.sub {
  margin: 8px 0 0;
  max-width: 640px;
  font-size: 14px;
  line-height: 1.8;
  color: #6b7789;
}

.day-tag {
  flex: none;
}

.head-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  margin-top: 4px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.card {
  border: 1px solid #e1e6ef;
  border-radius: 14px;
  background: #fff;
}

.card :deep(.el-card__header) {
  padding: 15px 18px;
  border-bottom: 1px solid #edf0f5;
}

.card :deep(.el-card__body) {
  padding: 18px;
}

.card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #18202f;
}

.card-kicker {
  font-size: 11px;
  font-weight: 400;
  color: #9aa4b5;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.identity {
  display: grid;
  gap: 11px;
}

.identity-row {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 12px;
  align-items: baseline;
  font-size: 13px;
  color: #3d4a5e;
}

.label {
  font-size: 11.5px;
  color: #8a95a7;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.permissions {
  align-items: flex-start;
}

.health {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0 16px;
  border-bottom: 1px dashed #edf0f5;
}

.health strong {
  font-size: 15px;
  color: #18202f;
}

.health p {
  margin: 3px 0 0;
  font-size: 12px;
  color: #8a95a7;
}

.health-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  flex: none;
  background: #c3cad6;
}

.health-dot.ok {
  background: #1f9d6a;
  box-shadow: 0 0 0 4px rgba(31, 157, 106, 0.12);
}

.health-dot.down {
  background: #d14343;
  box-shadow: 0 0 0 4px rgba(209, 67, 67, 0.12);
}

.health-dot.checking {
  background: #b7791f;
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.4;
  }
}

.stack {
  display: grid;
  gap: 8px;
  padding-top: 14px;
}

.stack-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
  color: #6b7789;
}

.stack-row code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  color: #3d4a5e;
}

.lower {
  align-items: start;
}

.checklist {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}

.checklist li {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  gap: 10px;
  align-items: start;
  padding: 9px 0;
  border-bottom: 1px dotted #edf0f5;
}

.checklist li:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.checklist strong {
  font-size: 13px;
  color: #18202f;
}

.checklist p {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #8a95a7;
}

.check {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid #d8dee8;
  font-size: 11px;
  color: #9aa4b5;
}

.checklist li.done .check {
  border-color: #bfe5d3;
  background: #eefaf4;
  color: #1f9d6a;
}

.next-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 11px;
  counter-reset: none;
}

.next-list li {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  align-items: baseline;
}

.next-list span {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: #9aa4b5;
  font-variant-numeric: tabular-nums;
}

.next-list p {
  margin: 0;
  font-size: 13px;
  color: #3d4a5e;
}

.next-note {
  margin: 18px 0 0;
  padding-top: 14px;
  border-top: 1px dashed #edf0f5;
  font-size: 12px;
  line-height: 1.7;
  color: #9aa4b5;
}

@media (max-width: 860px) {
  .cards {
    grid-template-columns: 1fr;
  }

  .page-head {
    flex-direction: column;
  }

  h1 {
    font-size: 26px;
  }
}
</style>
