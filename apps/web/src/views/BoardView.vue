<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from '@vibe/shared';
import { fetchProjects, type Project } from '@/api/projects';
import { criteriaCountOf, fetchTasks, type TaskSummary } from '@/api/tasks';
import { readApiError } from '@/utils/api-error';
import { formatDateTime } from '@/utils/format';
import { statusTagType } from '@/utils/task-status';

const route = useRoute();
const router = useRouter();

const tasks = ref<TaskSummary[]>([]);
const projects = ref<Project[]>([]);
const loading = ref(true);
const error = ref('');

const projectFilter = ref('');
const keyword = ref('');

/** ?status= 只接受合法状态，非法值按未筛选处理 */
const statusFilter = computed<TaskStatus | null>(() => {
  const value = route.query.status;
  if (typeof value !== 'string') {
    return null;
  }
  return (TASK_STATUSES as readonly string[]).includes(value)
    ? (value as TaskStatus)
    : null;
});

const singleColumn = computed(() => statusFilter.value !== null);

const keywordTerm = computed(() => keyword.value.trim().toLowerCase());

watch(
  () => route.query.projectId,
  (value) => {
    projectFilter.value = typeof value === 'string' ? value : '';
  },
  { immediate: true },
);

const filteredTasks = computed(() =>
  tasks.value.filter((task) => {
    if (projectFilter.value) {
      const projectId = task.projectId ?? task.project?.id;
      if (projectId !== projectFilter.value) {
        return false;
      }
    }
    if (keywordTerm.value && !task.title.toLowerCase().includes(keywordTerm.value)) {
      return false;
    }
    return true;
  }),
);

/** 按状态分组，组内按更新时间倒序，时间相同再按 id 倒序 */
const groupedTasks = computed<Record<TaskStatus, TaskSummary[]>>(() => {
  const groups = TASK_STATUSES.reduce(
    (acc, status) => {
      acc[status] = [];
      return acc;
    },
    {} as Record<TaskStatus, TaskSummary[]>,
  );

  for (const task of filteredTasks.value) {
    groups[task.status].push(task);
  }

  for (const status of TASK_STATUSES) {
    groups[status].sort((a, b) => {
      const diff =
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (diff !== 0) {
        return diff;
      }
      return a.id < b.id ? 1 : -1;
    });
  }

  return groups;
});

const visibleStatuses = computed<TaskStatus[]>(() =>
  statusFilter.value ? [statusFilter.value] : [...TASK_STATUSES],
);

const columns = computed(() =>
  visibleStatuses.value.map((status) => ({
    status,
    label: TASK_STATUS_LABELS[status],
    tasks: groupedTasks.value[status],
  })),
);

const visibleTaskCount = computed(() =>
  columns.value.reduce((sum, column) => sum + column.tasks.length, 0),
);

/** 优先用任务自带的项目信息，缺失时回退到已加载的项目列表 */
function projectNameOf(task: TaskSummary): string {
  if (task.project?.name) {
    return task.project.name;
  }
  const projectId = task.projectId ?? task.project?.id;
  const matched = projectId
    ? projects.value.find((project) => project.id === projectId)
    : undefined;
  return matched?.name ?? '未归属项目';
}

const hasFilters = computed(() =>
  Boolean(projectFilter.value || keywordTerm.value || statusFilter.value),
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [taskList, projectList] = await Promise.all([
      fetchTasks(),
      fetchProjects(),
    ]);
    tasks.value = taskList;
    projects.value = projectList;

    // ?projectId= 指向不存在的项目时回退到全部项目
    if (
      projectFilter.value &&
      !projectList.some((project) => project.id === projectFilter.value)
    ) {
      projectFilter.value = '';
    }
  } catch (value: unknown) {
    error.value = readApiError(value, '加载看板失败，请稍后重试。');
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="board-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">Board · 看板</p>
        <h1>看板</h1>
        <p class="sub">
          五个状态一屏推进，卡片按更新时间倒序排列。当前共
          {{ tasks.length }} 个任务、{{ projects.length }} 个项目。
        </p>
      </div>
    </header>

    <section v-if="error" class="error-state">
      <el-alert
        :title="error"
        type="error"
        :closable="false"
        show-icon
      />
      <el-button type="primary" plain @click="load">重新加载</el-button>
    </section>

    <div v-if="loading" class="state">正在加载看板…</div>

    <template v-else-if="!error">
      <div class="filter-bar">
        <el-select
          v-model="projectFilter"
          class="project-select"
          placeholder="全部项目"
        >
          <el-option label="全部项目" value="" />
          <el-option
            v-for="project in projects"
            :key="project.id"
            :label="project.name"
            :value="project.id"
          />
        </el-select>

        <el-input
          v-model="keyword"
          class="keyword-input"
          placeholder="搜索任务标题"
          clearable
        />

        <span v-if="hasFilters" class="filter-count">
          筛选结果 {{ visibleTaskCount }} 个任务
        </span>
      </div>

      <div
        v-if="singleColumn || visibleTaskCount > 0"
        class="board-scroll"
      >
        <div class="board" :class="{ single: singleColumn }">
          <section
            v-for="column in columns"
            :key="column.status"
            class="column"
          >
            <header class="column-head">
              <el-tag
                size="small"
                effect="plain"
                :type="statusTagType(column.status)"
              >
                {{ column.label }}
              </el-tag>
              <span class="column-count">{{ column.tasks.length }}</span>
              <router-link
                v-if="singleColumn"
                to="/board"
                class="show-all"
              >
                查看全部
              </router-link>
            </header>

            <div class="column-cards">
              <p v-if="!column.tasks.length" class="column-empty">暂无任务</p>

              <router-link
                v-for="task in column.tasks"
                :key="task.id"
                :to="{ name: 'task-detail', params: { id: task.id } }"
                class="task-card"
              >
                <h2 class="task-title">{{ task.title }}</h2>
                <p class="task-project">{{ projectNameOf(task) }}</p>
                <div class="task-meta">
                  <span>{{ criteriaCountOf(task) }} 条验收</span>
                  <time>{{ formatDateTime(task.updatedAt) }}</time>
                </div>
              </router-link>
            </div>
          </section>
        </div>
      </div>

      <el-empty
        v-else-if="!tasks.length && !hasFilters"
        description="还没有任务，先到项目里创建任务"
      >
        <el-button type="primary" @click="router.push('/projects')">
          去项目页
        </el-button>
      </el-empty>

      <el-empty
        v-else
        description="没有符合条件的任务，试试调整项目或关键词"
      />
    </template>
  </div>
</template>

<style scoped>
.board-page {
  display: grid;
  gap: 20px;
  min-width: 0;
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
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.project-select {
  width: 200px;
}

.keyword-input {
  width: 240px;
}

.filter-count {
  margin-left: auto;
  font-size: 12px;
  color: #8a95a7;
  font-variant-numeric: tabular-nums;
}

/* 只有看板容器横向滚动，页面本身保持不横向滚动 */
.board-scroll {
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 6px;
}

.board {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: max-content;
  min-width: 100%;
}

.board.single {
  display: block;
  width: 100%;
  min-width: 0;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 0 0 236px;
  padding: 12px;
  border: 1px solid #e1e6ef;
  border-radius: 14px;
  background: #f0f3f8;
}

.board.single .column {
  width: 100%;
  flex-basis: auto;
}

.column-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 4px;
}

.column-count {
  font-size: 11.5px;
  font-weight: 600;
  color: #8a95a7;
  font-variant-numeric: tabular-nums;
}

.show-all {
  margin-left: auto;
  font-size: 12px;
  color: #2f6fed;
  text-decoration: none;
}

.show-all:hover {
  text-decoration: underline;
}

.column-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.column-empty {
  margin: 0;
  padding: 22px 8px;
  text-align: center;
  font-size: 12px;
  color: #9aa4b5;
  border: 1px dashed #d5dce7;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.55);
}

.task-card {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid #e1e6ef;
  border-radius: 10px;
  background: #fff;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease,
    transform 0.15s ease;
}

.task-card:hover {
  border-color: #b9c9e4;
  box-shadow: 0 6px 18px rgba(31, 58, 95, 0.08);
  transform: translateY(-1px);
}

.task-card:focus-visible {
  outline: 2px solid #2f6fed;
  outline-offset: 2px;
}

.task-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  color: #1f3a5f;
  overflow-wrap: anywhere;
}

.task-project {
  margin: 0;
  font-size: 11.5px;
  color: #7c8799;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: #5c687b;
  font-variant-numeric: tabular-nums;
}

.task-meta time {
  flex: none;
}

@media (max-width: 640px) {
  .page-head {
    flex-direction: column;
  }

  h1 {
    font-size: 26px;
  }

  .project-select,
  .keyword-input {
    width: 100%;
  }

  .filter-count {
    margin-left: 0;
  }
}
</style>
