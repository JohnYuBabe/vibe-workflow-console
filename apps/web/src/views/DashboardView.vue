<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskStatus,
} from '@vibe/shared';
import { useAuthStore } from '@/stores/auth';
import {
  fetchDashboardSummary,
  type DashboardSummary,
  type DashboardTaskRef,
} from '@/api/dashboard';
import { readApiError } from '@/utils/api-error';
import { formatDateTime } from '@/utils/format';

const auth = useAuthStore();
const router = useRouter();

const summary = ref<DashboardSummary | null>(null);
const loading = ref(true);
const loadError = ref('');

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    summary.value = await fetchDashboardSummary();
  } catch (error: unknown) {
    loadError.value = readApiError(error, '加载交付数据失败，请稍后重试。');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** 与任务状态标签的配色保持一致，五个状态在分布条里各有颜色 */
const STATUS_COLORS: Record<TaskStatus, string> = {
  draft: '#9aa4b5',
  ready: '#2f6fed',
  in_progress: '#b7791f',
  review: '#d14343',
  done: '#1f9d6a',
};

function countOf(status: TaskStatus): number {
  return summary.value?.statusCounts[status] ?? 0;
}

const taskTotal = computed(() => summary.value?.totals.tasks ?? 0);
const reviewCount = computed(() => countOf('review'));
const projectTotal = computed(() => summary.value?.totals.projects ?? 0);
const aiSessionTotal = computed(() => summary.value?.totals.aiSessions ?? 0);
const decisionCount = computed(() => summary.value?.totals.decisions ?? 0);

const statusSegments = computed(() =>
  TASK_STATUSES.map((status) => {
    const count = countOf(status);
    return {
      status,
      label: TASK_STATUS_LABELS[status],
      count,
      color: STATUS_COLORS[status],
      percent: taskTotal.value > 0 ? (count / taskTotal.value) * 100 : 0,
    };
  }).filter((segment) => segment.count > 0),
);

/** 通过率按百分比展示；没有验证记录时显示破折号 */
const passRateText = computed(() => {
  const rate = summary.value?.verification.passRate;
  return rate == null ? '—' : `${Math.round(rate * 100)}%`;
});

interface BlockedGroup {
  key: 'spec' | 'verification' | 'traceability';
  title: string;
  hint: string;
  empty: string;
  tasks: DashboardTaskRef[];
}

const blockedGroups = computed<BlockedGroup[]>(() => {
  const blocked = summary.value?.blocked;
  return [
    {
      key: 'spec',
      title: '规格未达标',
      hint: '状态为待开发，但规格字数或验收条数不足',
      empty: '没有规格未达标的任务',
      tasks: blocked?.spec ?? [],
    },
    {
      key: 'verification',
      title: '缺通过验证',
      hint: '状态为待审查，但还没有一条通过的验证记录',
      empty: '没有缺通过验证的任务',
      tasks: blocked?.verification ?? [],
    },
    {
      key: 'traceability',
      title: '缺追溯记录',
      hint: '状态为待审查，但没有 AI 会话，人工记录也不足 20 字',
      empty: '没有缺追溯记录的任务',
      tasks: blocked?.traceability ?? [],
    },
  ];
});
</script>

<template>
  <div class="dashboard">
    <header class="page-head">
      <div class="head-main">
        <p class="eyebrow">Delivery · 交付概览</p>
        <h1>交付控制台</h1>
        <p class="sub">
          欢迎，{{ auth.user?.name ?? '开发者' }}。任务、验证、会话与决策的指标
          汇总在这里，点开可跳转的卡片会回到对应的看板或项目。
        </p>
      </div>
      <div class="head-side">
        <el-button type="primary" @click="router.push('/board')">
          任务看板
        </el-button>
      </div>
    </header>

    <div v-if="auth.user" class="identity-strip">
      <span class="identity-avatar" aria-hidden="true">
        {{ auth.user.name.slice(0, 1) }}
      </span>
      <strong class="identity-name">{{ auth.user.name }}</strong>
      <span class="identity-email">{{ auth.user.email }}</span>
      <div class="identity-tags">
        <el-tag
          v-for="role in auth.user.roles"
          :key="role"
          size="small"
          effect="plain"
        >
          {{ role }}
        </el-tag>
      </div>
      <span class="identity-perms">
        {{ auth.user.permissions.length }} 项权限
      </span>
    </div>

    <div v-if="loading" class="state">正在加载交付数据…</div>

    <section v-else-if="loadError" class="error-state">
      <el-alert
        :title="loadError"
        type="error"
        :closable="false"
        show-icon
      />
      <el-button type="primary" plain @click="load">重新加载</el-button>
    </section>

    <template v-else-if="summary">
      <section class="stat-grid">
        <router-link to="/board" class="stat-card">
          <span class="stat-label">任务总数</span>
          <strong class="stat-value">{{ summary.totals.tasks }}</strong>
          <span class="stat-meta">查看完整看板 →</span>
        </router-link>

        <router-link
          to="/board?status=review"
          class="stat-card"
          :class="{ 'is-alert': reviewCount > 0 }"
        >
          <span class="stat-label">待审查</span>
          <strong class="stat-value">{{ reviewCount }}</strong>
          <span class="stat-meta">进入待审查列 →</span>
        </router-link>

        <div class="stat-card">
          <span class="stat-label">验证通过率</span>
          <strong class="stat-value">{{ passRateText }}</strong>
          <span class="stat-meta">
            {{ summary.verification.passed }} / {{ summary.verification.total }}
            条验证通过
          </span>
        </div>

        <router-link to="/projects" class="stat-card">
          <span class="stat-label">项目</span>
          <strong class="stat-value">{{ projectTotal }}</strong>
          <span class="stat-meta">查看全部项目 →</span>
        </router-link>

        <div class="stat-card">
          <span class="stat-label">AI 会话</span>
          <strong class="stat-value">{{ aiSessionTotal }}</strong>
          <span class="stat-meta">在任务详情里记录</span>
        </div>

        <router-link to="/projects" class="stat-card">
          <span class="stat-label">决策记录</span>
          <strong class="stat-value">{{ decisionCount }}</strong>
          <span class="stat-meta">在项目详情里维护 →</span>
        </router-link>
      </section>

      <el-card class="card status-card" shadow="never">
        <template #header>
          <div class="card-head">
            <span>状态分布</span>
            <span class="card-kicker">共 {{ taskTotal }} 个任务</span>
          </div>
        </template>

        <div
          v-if="taskTotal > 0"
          class="status-bar"
          role="img"
          aria-label="任务状态分布"
        >
          <span
            v-for="segment in statusSegments"
            :key="segment.status"
            class="status-bar-segment"
            :style="{
              width: `${segment.percent}%`,
              background: segment.color,
            }"
            :title="`${segment.label} ${segment.count}`"
          />
        </div>
        <div v-else class="status-bar-empty">
          还没有任务，创建任务后这里会显示状态分布
        </div>

        <div class="status-legend">
          <router-link
            v-for="status in TASK_STATUSES"
            :key="status"
            :to="`/board?status=${status}`"
            class="status-item"
            :class="{ zero: countOf(status) === 0 }"
          >
            <span
              class="status-dot"
              :style="{ background: STATUS_COLORS[status] }"
              aria-hidden="true"
            />
            <span class="status-label">{{ TASK_STATUS_LABELS[status] }}</span>
            <strong class="status-count">{{ countOf(status) }}</strong>
          </router-link>
        </div>
      </el-card>

      <section class="blocked-grid">
        <el-card
          v-for="group in blockedGroups"
          :key="group.key"
          class="card blocked-card"
          shadow="never"
        >
          <template #header>
            <div class="card-head">
              <span>{{ group.title }}</span>
              <el-tag
                size="small"
                :type="group.tasks.length > 0 ? 'warning' : 'info'"
                effect="plain"
              >
                {{ group.tasks.length }}
              </el-tag>
            </div>
          </template>

          <p class="blocked-hint">{{ group.hint }}</p>

          <ul v-if="group.tasks.length > 0" class="blocked-list">
            <li v-for="task in group.tasks" :key="task.id">
              <router-link :to="`/tasks/${task.id}`" class="blocked-item">
                <span class="blocked-title">{{ task.title }}</span>
                <span class="blocked-project">{{ task.project.name }}</span>
              </router-link>
            </li>
          </ul>

          <p v-else class="blocked-empty">{{ group.empty }}</p>
        </el-card>
      </section>

      <p class="generated">
        数据生成于 {{ formatDateTime(summary.generatedAt) }}，刷新页面可获取最新数据。
      </p>
    </template>

    <el-empty v-else description="暂无交付数据" />
  </div>
</template>

<style scoped>
.dashboard {
  display: grid;
  gap: 18px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.head-main {
  min-width: 0;
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

.head-side {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  margin-top: 4px;
}

.identity-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid #e1e6ef;
  border-radius: 12px;
  background: #fff;
  font-size: 12px;
  color: #6b7789;
}

.identity-avatar {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex: none;
  background: #1f3a5f;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.identity-name {
  font-size: 13px;
  color: #18202f;
}

.identity-email {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #8a95a7;
}

.identity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.identity-perms {
  margin-left: auto;
  color: #9aa4b5;
  font-variant-numeric: tabular-nums;
}

.state {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: #8a95a7;
}

.error-state {
  display: grid;
  justify-items: start;
  gap: 12px;
  padding: 18px;
  border: 1px solid #f0c9c9;
  border-radius: 14px;
  background: #fff;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.stat-card {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid #e1e6ef;
  border-radius: 14px;
  background: #fff;
  color: inherit;
  text-decoration: none;
}

a.stat-card {
  transition: border-color 0.15s ease, box-shadow 0.15s ease,
    transform 0.15s ease;
}

a.stat-card:hover {
  border-color: #b9c9e4;
  box-shadow: 0 10px 28px rgba(31, 58, 95, 0.08);
  transform: translateY(-1px);
}

a.stat-card:focus-visible {
  outline: 2px solid #2f6fed;
  outline-offset: 2px;
}

.stat-label {
  font-size: 12px;
  color: #8a95a7;
}

.stat-value {
  font-size: 30px;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: #18202f;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.stat-card.is-alert .stat-value {
  color: #d14343;
}

.stat-meta {
  font-size: 11.5px;
  line-height: 1.5;
  color: #5c687b;
  overflow-wrap: anywhere;
}

.card {
  border: 1px solid #e1e6ef;
  border-radius: 14px;
  background: #fff;
  min-width: 0;
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
  font-variant-numeric: tabular-nums;
}

.status-bar {
  display: flex;
  width: 100%;
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  background: #edf0f5;
}

.status-bar-segment {
  display: block;
  height: 100%;
  min-width: 2px;
}

.status-bar-empty {
  padding: 12px 14px;
  border: 1px dashed #e1e6ef;
  border-radius: 10px;
  font-size: 12px;
  color: #9aa4b5;
}

.status-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin-top: 16px;
}

.status-item {
  display: grid;
  grid-template-columns: 9px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  flex: 1 1 130px;
  min-width: 0;
  padding: 8px 11px;
  border: 1px solid #edf0f5;
  border-radius: 9px;
  color: inherit;
  text-decoration: none;
}

.status-item:hover {
  border-color: #b9c9e4;
}

.status-item:focus-visible {
  outline: 2px solid #2f6fed;
  outline-offset: 2px;
}

.status-item.zero {
  opacity: 0.55;
}

.status-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.status-label {
  font-size: 12px;
  color: #3d4a5e;
  white-space: nowrap;
}

.status-count {
  font-size: 13px;
  color: #18202f;
  font-variant-numeric: tabular-nums;
}

.blocked-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  align-items: start;
}

.blocked-hint {
  margin: 0 0 12px;
  font-size: 11.5px;
  line-height: 1.6;
  color: #9aa4b5;
}

.blocked-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.blocked-item {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid #edf0f5;
  border-radius: 9px;
  color: inherit;
  text-decoration: none;
}

.blocked-item:hover {
  border-color: #b9c9e4;
  background: #f8fafd;
}

.blocked-item:focus-visible {
  outline: 2px solid #2f6fed;
  outline-offset: 2px;
}

.blocked-title {
  font-size: 13px;
  line-height: 1.55;
  color: #18202f;
  overflow-wrap: anywhere;
}

.blocked-project {
  font-size: 11.5px;
  color: #8a95a7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blocked-empty {
  margin: 0;
  padding: 14px 0 6px;
  font-size: 12px;
  color: #9aa4b5;
}

.generated {
  margin: 0;
  font-size: 11.5px;
  color: #5c687b;
}

@media (max-width: 1000px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .page-head {
    flex-direction: column;
  }

  h1 {
    font-size: 26px;
  }

  .head-side {
    margin-top: 0;
  }
}

@media (max-width: 560px) {
  .identity-perms {
    margin-left: 0;
  }

  .stat-grid {
    gap: 10px;
  }

  .stat-card {
    padding: 13px 14px;
  }

  .stat-value {
    font-size: 24px;
  }
}
</style>
