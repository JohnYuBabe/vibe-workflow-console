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
import {
  DECISION_STATUSES,
  DECISION_STATUS_LABELS,
  createDecision,
  decisionStatusTagType,
  fetchDecision,
  fetchDecisions,
  removeDecision,
  updateDecision,
  type DecisionDetail,
  type DecisionStatus,
  type DecisionSummary,
} from '@/api/decisions';
import { useAuthStore } from '@/stores/auth';
import { readApiError } from '@/utils/api-error';
import { formatDateTime } from '@/utils/format';
import { statusLabel, statusTagType } from '@/utils/task-status';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const projectId = computed(() => String(route.params.id));

const project = ref<ProjectDetail | null>(null);
const tasks = ref<TaskSummary[]>([]);
const loading = ref(true);
const tasksLoading = ref(false);
const error = ref('');
const tasksError = ref('');
const tasksStale = ref(false);
const statusFilter = ref<TaskStatus | 'all'>('all');

const decisions = ref<DecisionSummary[]>([]);
const decisionsLoading = ref(false);
const decisionsError = ref('');
const canWriteDecisions = computed(() =>
  auth.hasPermission('decision:write'),
);
/** 项目详情自带全量任务，关联任务下拉直接复用，不受上方状态筛选影响 */
const taskOptions = computed<TaskSummary[]>(() => project.value?.tasks ?? []);

const decisionDialogVisible = ref(false);
const decisionDialogLoading = ref(false);
const decisionSubmitting = ref(false);
const deletingDecisionId = ref<string | null>(null);

const decisionViewVisible = ref(false);
const decisionViewLoading = ref(false);
const decisionViewError = ref('');
const decisionViewId = ref('');
const decisionViewRecord = ref<DecisionDetail | null>(null);
/** 请求令牌：关闭弹窗后到达的响应直接丢弃，避免覆盖下一次打开的内容 */
let decisionDialogRequest = 0;
let decisionViewRequest = 0;
const decisionForm = reactive({
  id: null as string | null,
  title: '',
  context: '',
  options: '',
  decision: '',
  consequences: '',
  status: 'proposed' as DecisionStatus,
  taskId: '',
});

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
    tasksError.value = '';
    tasksStale.value = false;
  } catch (value: unknown) {
    tasksError.value = readApiError(value, '加载任务失败，请稍后重试。');
    // 失败时保留上一次的结果，但要提示用户当前筛选下可能是旧数据
    tasksStale.value = tasks.value.length > 0;
  } finally {
    tasksLoading.value = false;
  }
}

async function loadDecisions(): Promise<void> {
  decisionsLoading.value = true;
  try {
    decisions.value = await fetchDecisions({ projectId: projectId.value });
    decisionsError.value = '';
  } catch (value: unknown) {
    decisionsError.value = readApiError(
      value,
      '加载决策记录失败，请稍后重试。',
    );
  } finally {
    decisionsLoading.value = false;
  }
}

async function loadAll(): Promise<void> {
  await Promise.all([loadProject(), loadTasks(), loadDecisions()]);
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

function resetDecisionForm(): void {
  decisionForm.id = null;
  decisionForm.title = '';
  decisionForm.context = '';
  decisionForm.options = '';
  decisionForm.decision = '';
  decisionForm.consequences = '';
  decisionForm.status = 'proposed';
  decisionForm.taskId = '';
}

function openCreateDecision(): void {
  resetDecisionForm();
  decisionDialogLoading.value = false;
  decisionDialogVisible.value = true;
}

/** 列表只有摘要，编辑前必须按 id 拉取完整正文 */
async function openEditDecision(record: DecisionSummary): Promise<void> {
  const requestId = ++decisionDialogRequest;
  resetDecisionForm();
  decisionForm.id = record.id;
  decisionForm.title = record.title;
  decisionForm.status = record.status;
  decisionForm.taskId = record.taskId ?? '';
  decisionDialogVisible.value = true;
  decisionDialogLoading.value = true;

  try {
    const detail = await fetchDecision(record.id);
    if (requestId !== decisionDialogRequest || !decisionDialogVisible.value) {
      return;
    }
    decisionForm.title = detail.title;
    decisionForm.context = detail.context;
    decisionForm.options = detail.options;
    decisionForm.decision = detail.decision;
    decisionForm.consequences = detail.consequences ?? '';
    decisionForm.status = detail.status;
    decisionForm.taskId = detail.taskId ?? '';
  } catch (value: unknown) {
    if (requestId !== decisionDialogRequest || !decisionDialogVisible.value) {
      return;
    }
    decisionDialogVisible.value = false;
    ElMessage.error(readApiError(value, '加载决策详情失败，请稍后重试。'));
  } finally {
    if (requestId === decisionDialogRequest) {
      decisionDialogLoading.value = false;
    }
  }
}

/** 只读查看：决策正文只在详情接口返回，打开时按 id 拉取 */
async function loadDecisionView(): Promise<void> {
  const id = decisionViewId.value;
  if (!id) return;

  const requestId = ++decisionViewRequest;
  decisionViewVisible.value = true;
  decisionViewLoading.value = true;
  decisionViewError.value = '';
  decisionViewRecord.value = null;

  try {
    const detail = await fetchDecision(id);
    if (requestId !== decisionViewRequest || !decisionViewVisible.value) {
      return;
    }
    decisionViewRecord.value = detail;
  } catch (value: unknown) {
    if (requestId !== decisionViewRequest || !decisionViewVisible.value) {
      return;
    }
    decisionViewError.value = readApiError(
      value,
      '加载决策详情失败，请稍后重试。',
    );
  } finally {
    if (requestId === decisionViewRequest) {
      decisionViewLoading.value = false;
    }
  }
}

function openDecisionView(record: DecisionSummary): void {
  decisionViewId.value = record.id;
  void loadDecisionView();
}

watch(decisionDialogVisible, (visible) => {
  if (!visible) {
    // 关闭后作废进行中的请求，晚到的响应不再写入表单
    decisionDialogRequest += 1;
    decisionDialogLoading.value = false;
  }
});

watch(decisionViewVisible, (visible) => {
  if (!visible) {
    decisionViewRequest += 1;
    decisionViewLoading.value = false;
  }
});

async function submitDecision(): Promise<void> {
  if (decisionSubmitting.value || decisionDialogLoading.value) return;

  const title = decisionForm.title.trim();
  const context = decisionForm.context.trim();
  const options = decisionForm.options.trim();
  const decision = decisionForm.decision.trim();

  if (!title) {
    ElMessage.warning('请输入决策标题');
    return;
  }
  if (!context) {
    ElMessage.warning('请填写决策背景');
    return;
  }
  if (!options) {
    ElMessage.warning('请填写候选方案');
    return;
  }
  if (!decision) {
    ElMessage.warning('请填写最终决定');
    return;
  }

  decisionSubmitting.value = true;
  try {
    const payload = {
      title,
      context,
      options,
      decision,
      status: decisionForm.status,
      taskId: decisionForm.taskId || null,
    };

    if (decisionForm.id) {
      await updateDecision(decisionForm.id, {
        ...payload,
        consequences: decisionForm.consequences.trim() || null,
      });
      ElMessage.success('决策记录已更新');
    } else {
      await createDecision(projectId.value, {
        ...payload,
        consequences: decisionForm.consequences.trim() || undefined,
      });
      ElMessage.success('决策记录已创建');
    }

    decisionDialogVisible.value = false;
    await loadDecisions();
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '保存决策记录失败，请稍后重试。'));
  } finally {
    decisionSubmitting.value = false;
  }
}

async function deleteDecisionRecord(record: DecisionSummary): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认删除决策「${record.title}」？`,
      '删除决策记录',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }

  deletingDecisionId.value = record.id;
  try {
    await removeDecision(record.id);
    ElMessage.success('决策记录已删除');
    await loadDecisions();
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '删除决策记录失败，请稍后重试。'));
  } finally {
    deletingDecisionId.value = null;
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
    >
      <div class="alert-body">
        <el-button size="small" @click="loadProject">重新加载</el-button>
      </div>
    </el-alert>

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

        <template v-else>
          <el-alert
            v-if="tasksError"
            :title="tasksError"
            type="error"
            :closable="false"
            show-icon
            class="inline-alert"
          >
            <div class="alert-body">
              <span v-if="tasksStale">
                当前筛选条件下的列表可能不是最新数据。
              </span>
              <el-button size="small" @click="loadTasks">重新加载</el-button>
            </div>
          </el-alert>

          <el-table
            v-if="tasks.length || !tasksError"
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
        </template>
      </el-card>

      <el-card class="decisions-card" shadow="never">
        <template #header>
          <div class="card-head">
            <span>决策记录</span>
            <el-button
              v-permission="'decision:write'"
              size="small"
              type="primary"
              @click="openCreateDecision"
            >
              新建决策
            </el-button>
          </div>
        </template>

        <div v-if="decisionsLoading" class="state small">
          正在加载决策记录…
        </div>

        <template v-else>
          <el-alert
            v-if="decisionsError"
            :title="decisionsError"
            type="error"
            :closable="false"
            show-icon
            class="inline-alert"
          >
            <div class="alert-body">
              <span v-if="decisions.length">下方列表可能不是最新数据。</span>
              <el-button size="small" @click="loadDecisions">
                重新加载
              </el-button>
            </div>
          </el-alert>

          <el-empty
            v-if="!decisions.length && !decisionsError"
            description="暂无决策记录，重要取舍建议记录在这里"
            :image-size="70"
          />

          <el-table
            v-else-if="decisions.length"
            :data="decisions"
            row-key="id"
            class="decision-table"
            empty-text="暂无决策记录"
          >
            <el-table-column label="标题" min-width="200">
              <template #default="{ row }">
                <el-button
                  link
                  type="primary"
                  class="decision-title"
                  @click="openDecisionView(row as DecisionSummary)"
                >
                  {{ row.title }}
                </el-button>
              </template>
            </el-table-column>
  
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  effect="plain"
                  :type="decisionStatusTagType(row.status)"
                >
                  {{ DECISION_STATUS_LABELS[row.status as DecisionStatus] }}
                </el-tag>
              </template>
            </el-table-column>
  
            <el-table-column label="关联任务" min-width="140">
              <template #default="{ row }">
                <router-link
                  v-if="row.task"
                  :to="`/tasks/${row.task.id}`"
                  class="decision-link"
                >
                  {{ row.task.title }}
                </router-link>
                <span v-else class="count-cell">—</span>
              </template>
            </el-table-column>
  
            <el-table-column label="更新时间" width="160" align="right">
              <template #default="{ row }">
                <span class="time-cell">
                  {{ formatDateTime(row.updatedAt) }}
                </span>
              </template>
            </el-table-column>
  
            <el-table-column
              v-if="canWriteDecisions"
              label="操作"
              width="120"
              align="right"
            >
              <template #default="{ row }">
                <el-button
                  text
                  type="primary"
                  size="small"
                  @click="openEditDecision(row as DecisionSummary)"
                >
                  编辑
                </el-button>
                <el-button
                  text
                  type="danger"
                  size="small"
                  :loading="deletingDecisionId === row.id"
                  @click="deleteDecisionRecord(row as DecisionSummary)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
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

    <el-dialog
      v-model="decisionDialogVisible"
      :title="decisionForm.id ? '编辑决策' : '新建决策'"
      width="min(600px, 92vw)"
      :close-on-click-modal="false"
    >
      <div v-if="decisionDialogLoading" class="state small">
        正在加载决策详情…
      </div>
      <el-form
        v-else
        label-position="top"
        @submit.prevent="submitDecision"
      >
        <el-form-item label="标题" required>
          <el-input
            v-model="decisionForm.title"
            placeholder="例如：采用 JWT 而不是 Session"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="背景" required>
          <el-input
            v-model="decisionForm.context"
            type="textarea"
            :rows="4"
            maxlength="5000"
            show-word-limit
            placeholder="当时的约束、问题，以及为什么需要做这个决定"
          />
        </el-form-item>

        <el-form-item label="候选方案" required>
          <el-input
            v-model="decisionForm.options"
            type="textarea"
            :rows="4"
            maxlength="5000"
            show-word-limit
            placeholder="列出考虑过的方案，以及各自的取舍"
          />
        </el-form-item>

        <el-form-item label="决定" required>
          <el-input
            v-model="decisionForm.decision"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
            placeholder="最终选择了什么、为什么"
          />
        </el-form-item>

        <el-form-item label="后果（可选）">
          <el-input
            v-model="decisionForm.consequences"
            type="textarea"
            :rows="3"
            maxlength="5000"
            show-word-limit
            placeholder="这个决定带来的后续影响、待办或风险"
          />
        </el-form-item>

        <div class="decision-form-grid">
          <el-form-item label="状态">
            <el-select
              v-model="decisionForm.status"
              style="width: 100%"
            >
              <el-option
                v-for="status in DECISION_STATUSES"
                :key="status"
                :label="DECISION_STATUS_LABELS[status]"
                :value="status"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="关联任务（可选）">
            <el-select
              v-model="decisionForm.taskId"
              clearable
              :value-on-clear="''"
              placeholder="不关联任务"
              style="width: 100%"
            >
              <el-option
                v-for="task in taskOptions"
                :key="task.id"
                :label="task.title"
                :value="task.id"
              />
            </el-select>
          </el-form-item>
        </div>
      </el-form>

      <template #footer>
        <el-button @click="decisionDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="decisionSubmitting"
          :disabled="decisionDialogLoading"
          @click="submitDecision"
        >
          {{ decisionForm.id ? '保存修改' : '创建决策' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="decisionViewVisible"
      :title="decisionViewRecord?.title ?? '决策详情'"
      width="min(640px, 92vw)"
    >
      <div v-if="decisionViewLoading" class="state small">
        正在加载决策详情…
      </div>

      <el-alert
        v-else-if="decisionViewError"
        :title="decisionViewError"
        type="error"
        :closable="false"
        show-icon
      >
        <div class="alert-body">
          <el-button size="small" @click="loadDecisionView()">
            重新加载
          </el-button>
        </div>
      </el-alert>

      <div v-else-if="decisionViewRecord" class="decision-detail">
        <section class="detail-section">
          <h3>背景</h3>
          <p
            id="decision-detail-context"
            class="detail-text"
            aria-label="决策背景"
          >
            {{ decisionViewRecord.context }}
          </p>
        </section>

        <section class="detail-section">
          <h3>候选方案</h3>
          <p
            id="decision-detail-options"
            class="detail-text"
            aria-label="候选方案"
          >
            {{ decisionViewRecord.options }}
          </p>
        </section>

        <section class="detail-section">
          <h3>决定</h3>
          <p
            id="decision-detail-decision"
            class="detail-text"
            aria-label="最终决定"
          >
            {{ decisionViewRecord.decision }}
          </p>
        </section>

        <section v-if="decisionViewRecord.consequences" class="detail-section">
          <h3>后果</h3>
          <p
            id="decision-detail-consequences"
            class="detail-text"
            aria-label="决策后果"
          >
            {{ decisionViewRecord.consequences }}
          </p>
        </section>

        <div class="detail-meta">
          <span>
            状态：{{ DECISION_STATUS_LABELS[decisionViewRecord.status] }}
          </span>
          <span v-if="decisionViewRecord.task">
            关联任务：{{ decisionViewRecord.task.title }}
          </span>
          <span>更新于 {{ formatDateTime(decisionViewRecord.updatedAt) }}</span>
        </div>
      </div>

      <template #footer>
        <el-button @click="decisionViewVisible = false">关闭</el-button>
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
.tasks-card,
.decisions-card {
  border: 1px solid #e1e6ef;
  border-radius: 14px;
  background: #fff;
}

.meta-card :deep(.el-card__body) {
  padding: 18px;
}

.tasks-card :deep(.el-card__header),
.decisions-card :deep(.el-card__header) {
  padding: 14px 18px;
  border-bottom: 1px solid #edf0f5;
}

.tasks-card :deep(.el-card__body),
.decisions-card :deep(.el-card__body) {
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

.decision-title {
  height: auto;
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  overflow-wrap: anywhere;
}

.decision-title:hover {
  text-decoration: underline;
}

.decision-link {
  color: #1f3a5f;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.decision-link:hover {
  color: #2f6fed;
  text-decoration: underline;
}

.alert-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.inline-alert {
  margin: 10px 0 4px;
}

.decision-detail {
  display: grid;
  gap: 16px;
}

.detail-section h3 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #3d4a5e;
}

.detail-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: #3d4a5e;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding-top: 12px;
  border-top: 1px dashed #edf0f5;
  font-size: 11.5px;
  color: #7c8799;
}

.decision-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
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
}

@media (max-width: 520px) {
  .meta-grid {
    grid-template-columns: 1fr;
  }

  .decision-form-grid {
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
