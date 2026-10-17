<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from '@vibe/shared';
import {
  deleteProject,
  fetchProject,
  type ProjectDetail,
} from '@/api/projects';
import {
  createTask,
  criteriaCountOf,
  fetchTasks,
  type TaskSummary,
} from '@/api/tasks';
import { readApiError } from '@/utils/api-error';
import { formatDateTime } from '@/utils/format';
import { statusLabel, statusTagType } from '@/utils/task-status';

const route = useRoute();
const router = useRouter();

const projectId = computed(() => String(route.params.id));

const project = ref<ProjectDetail | null>(null);
const tasks = ref<TaskSummary[]>([]);
const loading = ref(true);
const tasksLoading = ref(false);
const error = ref('');
const statusFilter = ref<TaskStatus | 'all'>('all');

const dialogVisible = ref(false);
const submitting = ref(false);
const form = reactive({
  title: '',
  spec: '',
  criteria: ['', '', ''],
});

async function loadProject(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    project.value = await fetchProject(projectId.value);
  } catch (value: unknown) {
    error.value = readApiError(value, '加载项目失败，请稍后重试。');
  } finally {
    loading.value = false;
  }
}

async function loadTasks(): Promise<void> {
  tasksLoading.value = true;
  try {
    tasks.value = await fetchTasks({
      projectId: projectId.value,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
    });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '加载任务失败，请稍后重试。'));
  } finally {
    tasksLoading.value = false;
  }
}

async function loadAll(): Promise<void> {
  await Promise.all([loadProject(), loadTasks()]);
}

watch(statusFilter, () => {
  void loadTasks();
});

function openDialog(): void {
  form.title = '';
  form.spec = '';
  form.criteria = ['', '', ''];
  dialogVisible.value = true;
}

function addCriterion(): void {
  form.criteria.push('');
}

function removeCriterion(index: number): void {
  form.criteria.splice(index, 1);
  if (!form.criteria.length) {
    form.criteria.push('');
  }
}

async function submitTask(): Promise<void> {
  if (submitting.value) return;

  const title = form.title.trim();
  if (!title) {
    ElMessage.warning('请输入任务标题');
    return;
  }

  submitting.value = true;
  try {
    const created = await createTask(projectId.value, {
      title,
      spec: form.spec.trim() || undefined,
      acceptanceCriteria: form.criteria
        .map((item) => item.trim())
        .filter(Boolean),
    });

    ElMessage.success('任务已创建');
    dialogVisible.value = false;
    await loadTasks();

    if (created?.id) {
      await router.push({ name: 'task-detail', params: { id: created.id } });
    }
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '创建任务失败，请稍后重试。'));
  } finally {
    submitting.value = false;
  }
}

async function removeProject(): Promise<void> {
  const current = project.value;
  if (!current) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      `删除项目「${current.name}」及其所有任务，操作无法撤销。`,
      '删除项目',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }

  try {
    await deleteProject(current.id);
    ElMessage.success('项目已删除');
    await router.push({ name: 'projects' });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '删除项目失败，请稍后重试。'));
  }
}

function goTask(row: unknown): void {
  const id = (row as { id?: string } | null)?.id;
  if (id) {
    void router.push({ name: 'task-detail', params: { id } });
  }
}

onMounted(loadAll);
</script>

<template>
  <div class="project-detail">
    <router-link to="/projects" class="back-link">← 返回项目列表</router-link>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    />

    <div v-if="loading" class="state">正在加载项目…</div>

    <template v-else-if="project">
      <header class="page-head">
        <div>
          <p class="eyebrow">Project · 项目</p>
          <h1>{{ project.name }}</h1>
          <p class="sub">{{ project.description || '暂无项目描述' }}</p>
        </div>

        <div class="head-actions">
          <el-button
            v-permission="'task:write'"
            type="primary"
            @click="openDialog"
          >
            新建任务
          </el-button>
          <el-button
            v-permission="'project:write'"
            plain
            type="danger"
            @click="removeProject"
          >
            删除项目
          </el-button>
        </div>
      </header>

      <el-card class="meta-card" shadow="never">
        <div class="meta-grid">
          <div class="meta-item">
            <span class="label">负责人</span>
            <strong>{{ project.owner?.name ?? '—' }}</strong>
          </div>
          <div class="meta-item">
            <span class="label">仓库</span>
            <span class="meta-value">{{ project.repoUrl || '—' }}</span>
          </div>
          <div class="meta-item">
            <span class="label">创建时间</span>
            <span class="meta-value">{{ formatDateTime(project.createdAt) }}</span>
          </div>
          <div class="meta-item">
            <span class="label">任务总数</span>
            <strong>{{ project.tasks?.length ?? 0 }} 个</strong>
          </div>
        </div>
      </el-card>

      <el-card class="tasks-card" shadow="never">
        <template #header>
          <div class="card-head">
            <span>任务</span>
            <el-select
              v-model="statusFilter"
              size="small"
              class="status-filter"
              placeholder="全部状态"
            >
              <el-option label="全部状态" value="all" />
              <el-option
                v-for="status in TASK_STATUSES"
                :key="status"
                :label="TASK_STATUS_LABELS[status]"
                :value="status"
              />
            </el-select>
          </div>
        </template>

        <div v-if="tasksLoading" class="state small">正在加载任务…</div>

        <el-table
          v-else
          :data="tasks"
          row-key="id"
          class="task-table"
          row-class-name="task-row"
          empty-text="暂无任务"
          @row-click="goTask"
        >
          <el-table-column label="标题" min-width="200">
            <template #default="{ row }">
              <router-link
                :to="`/tasks/${row.id}`"
                class="task-link"
                @click.stop
              >
                {{ row.title }}
              </router-link>
            </template>
          </el-table-column>

          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="statusTagType(row.status)">
                {{ statusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column label="验收标准" width="110" align="right">
            <template #default="{ row }">
              <span class="count-cell">{{ criteriaCountOf(row) }} 条</span>
            </template>
          </el-table-column>

          <el-table-column label="更新时间" width="160" align="right">
            <template #default="{ row }">
              <span class="time-cell">{{ formatDateTime(row.updatedAt) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <el-dialog
      v-model="dialogVisible"
      title="新建任务"
      width="min(560px, 92vw)"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent="submitTask">
        <el-form-item label="任务标题" required>
          <el-input
            v-model="form.title"
            placeholder="例如：登录页支持邮箱密码登录"
            maxlength="120"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="任务规格">
          <el-input
            v-model="form.spec"
            type="textarea"
            :rows="5"
            placeholder="写清楚要做什么、边界是什么。进入开发前至少 20 字。"
          />
        </el-form-item>

        <el-form-item label="验收标准">
          <div class="criteria-editor">
            <div
              v-for="(_, index) in form.criteria"
              :key="index"
              class="criterion-row"
            >
              <span class="criterion-index">{{ index + 1 }}</span>
              <el-input
                v-model="form.criteria[index]"
                placeholder="一条可验证的验收标准"
              />
              <el-button text type="danger" @click="removeCriterion(index)">
                删除
              </el-button>
            </div>
            <el-button text type="primary" @click="addCriterion">
              + 添加一条
            </el-button>
            <p class="field-hint">
              进入「待开发」前至少需要 3 条非空验收标准，空行不会提交。
            </p>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitTask">
          创建任务
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.project-detail {
  display: grid;
  gap: 18px;
}

.back-link {
  width: fit-content;
  font-size: 12.5px;
  color: #7c8799;
  text-decoration: none;
}

.back-link:hover {
  color: #1f3a5f;
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
  font-size: 28px;
  letter-spacing: -0.02em;
  color: #18202f;
  overflow-wrap: anywhere;
}

.sub {
  margin: 8px 0 0;
  max-width: 640px;
  font-size: 14px;
  line-height: 1.8;
  color: #6b7789;
}

.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex: none;
  margin-top: 4px;
}

.head-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.meta-card,
.tasks-card {
  border: 1px solid #e1e6ef;
  border-radius: 14px;
  background: #fff;
}

.meta-card :deep(.el-card__body) {
  padding: 18px;
}

.tasks-card :deep(.el-card__header) {
  padding: 14px 18px;
  border-bottom: 1px solid #edf0f5;
}

.tasks-card :deep(.el-card__body) {
  padding: 4px 18px 14px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.meta-item {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.label {
  font-size: 11.5px;
  color: #8a95a7;
}

.meta-item strong {
  font-size: 13.5px;
  color: #18202f;
}

.meta-value {
  font-size: 13px;
  color: #3d4a5e;
  overflow-wrap: anywhere;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #18202f;
}

.status-filter {
  width: 140px;
}

.state {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: #8a95a7;
}

.state.small {
  padding: 24px 0;
}

.task-table {
  width: 100%;
}

.task-table :deep(.task-row) {
  cursor: pointer;
}

.task-link {
  color: #1f3a5f;
  font-weight: 500;
  text-decoration: none;
}

.task-link:hover {
  color: #2f6fed;
  text-decoration: underline;
}

.count-cell,
.time-cell {
  font-size: 12.5px;
  color: #6b7789;
  font-variant-numeric: tabular-nums;
}

.criteria-editor {
  width: 100%;
  display: grid;
  gap: 8px;
}

.criterion-row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.criterion-index {
  font-size: 11px;
  color: #9aa4b5;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.field-hint {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #9aa4b5;
}

@media (max-width: 860px) {
  .page-head {
    flex-direction: column;
  }

  h1 {
    font-size: 24px;
  }

  .head-actions {
    margin-top: 0;
  }

  .meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .task-table :deep(.el-table__body-wrapper) {
    overflow-x: auto;
  }
}

@media (max-width: 520px) {
  .meta-grid {
    grid-template-columns: 1fr;
  }

  .criterion-row {
    grid-template-columns: 18px minmax(0, 1fr);
  }

  .criterion-row :deep(.el-button) {
    grid-column: 2;
    justify-self: start;
    padding-left: 0;
  }
}
</style>
