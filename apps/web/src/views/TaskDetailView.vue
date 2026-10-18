<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ACCEPTANCE_MIN_COUNT,
  MANUAL_NOTE_MIN_LENGTH,
  SPEC_MIN_LENGTH,
  TASK_STATUS_LABELS,
  type AvailableTransition,
  type TaskStatus,
} from '@vibe/shared';
import {
  createAiSession,
  createVerification,
  deleteAiSession,
  deleteTask,
  deleteVerification,
  fetchTask,
  replaceCriteria,
  transitionTask,
  updateTask,
  type AiSessionView,
  type TaskDetail,
  type TaskGate,
  type TaskTransitionRecord,
  type VerificationResult,
  type VerificationView,
} from '@/api/tasks';
import {
  DECISION_STATUS_LABELS,
  decisionStatusTagType,
  fetchDecisions,
  type DecisionSummary,
} from '@/api/decisions';
import { useAuthStore } from '@/stores/auth';
import { readApiError } from '@/utils/api-error';
import { formatDateTime } from '@/utils/format';
import { isForwardTransition, statusTagType } from '@/utils/task-status';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const taskId = computed(() => String(route.params.id));

const task = ref<TaskDetail | null>(null);
const loading = ref(true);
const error = ref('');

const titleDraft = ref('');
const specDraft = ref('');
const noteDraft = ref('');
const criteriaDraft = ref<string[]>([]);
const transitionNote = ref('');

const saving = ref(false);
const transitioningTo = ref<TaskStatus | null>(null);
const deletingTask = ref(false);

const canWrite = computed(() => auth.hasPermission('task:write'));
const currentStatus = computed<TaskStatus>(
  () => task.value?.status ?? 'draft',
);
/** done 任务的门禁与证据已定格，前端一并收掉写入口，避免用户填完才收到 409 */
const canEdit = computed(
  () => canWrite.value && currentStatus.value !== 'done',
);
const transitions = computed<AvailableTransition[]>(
  () => task.value?.availableTransitions ?? [],
);

const specDraftLength = computed(() => specDraft.value.trim().length);
const noteDraftLength = computed(() => noteDraft.value.trim().length);
const criteriaFilledCount = computed(
  () => criteriaDraft.value.filter((item) => item.trim().length > 0).length,
);

/** 提交时会保存的验收标准，空行不计入 */
const draftCriteria = computed(() =>
  criteriaDraft.value.map((item) => item.trim()).filter(Boolean),
);
const savedCriteria = computed(() =>
  (task.value?.criteria ?? [])
    .map((criterion) => criterion.content.trim())
    .filter(Boolean),
);

/** 标题、规格、验收标准或人工记录与服务端已保存值不同即为未保存 */
const hasUnsavedChanges = computed(() => {
  const current = task.value;
  if (!current) {
    return false;
  }

  const criteria = draftCriteria.value;
  const saved = savedCriteria.value;

  return (
    titleDraft.value.trim() !== current.title.trim() ||
    specDraft.value !== (current.spec ?? '') ||
    noteDraft.value !== (current.manualNote ?? '') ||
    criteria.length !== saved.length ||
    criteria.some((item, index) => item !== saved[index])
  );
});

function percentOf(value: number, target: number): number {
  if (target <= 0) {
    return 100;
  }
  return Math.min(100, Math.round((value / target) * 100));
}

const specGatePercent = computed(() =>
  task.value
    ? percentOf(task.value.gate.specLength, SPEC_MIN_LENGTH)
    : 0,
);
const criteriaGatePercent = computed(() =>
  task.value
    ? percentOf(task.value.gate.criteriaCount, ACCEPTANCE_MIN_COUNT)
    : 0,
);
const verificationGatePercent = computed(() =>
  task.value ? percentOf(task.value.gate.passedVerifications, 1) : 0,
);

/** 详情未加载时的零值占位，页面此时不会渲染门禁面板 */
const EMPTY_GATE: TaskGate = {
  specLength: 0,
  criteriaCount: 0,
  specOk: false,
  criteriaOk: false,
  passedVerifications: 0,
  verificationOk: false,
  aiSessionCount: 0,
  manualNoteLength: 0,
  traceabilityOk: false,
};

/** 门禁摘要与会话/验证数据全部取服务端返回值，前端不在这里重算 */
const gate = computed<TaskGate>(() => ({
  ...EMPTY_GATE,
  ...(task.value?.gate ?? {}),
}));
const transitionRecords = computed<TaskTransitionRecord[]>(
  () => task.value?.transitions ?? [],
);
const verifications = computed<VerificationView[]>(
  () => task.value?.verifications ?? [],
);
const aiSessions = computed<AiSessionView[]>(
  () => task.value?.aiSessions ?? [],
);
/** 关联决策只读展示，列表只返回摘要，有记录时才渲染卡片 */
const decisions = ref<DecisionSummary[]>([]);

const verificationFormOpen = ref(false);
const savingVerification = ref(false);
const deletingVerificationId = ref<string | null>(null);
const verificationForm = reactive({
  command: '',
  result: 'passed' as VerificationResult,
  evidenceUrl: '',
  note: '',
});

const aiSessionFormOpen = ref(false);
const savingAiSession = ref(false);
const deletingAiSessionId = ref<string | null>(null);
const aiSessionForm = reactive({
  title: '',
  tool: '',
  summary: '',
});

function verificationTagType(result: VerificationResult): 'success' | 'danger' {
  return result === 'passed' ? 'success' : 'danger';
}

function verificationResultLabel(result: VerificationResult): string {
  return result === 'passed' ? '通过' : '未通过';
}

/** 只把 http(s) 链接渲染成可点击链接，历史脏数据里的 javascript: 之类不会被执行 */
function isHttpUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function syncDraft(value: TaskDetail): void {
  titleDraft.value = value.title;
  specDraft.value = value.spec ?? '';
  noteDraft.value = value.manualNote ?? '';
  criteriaDraft.value = value.criteria.length
    ? value.criteria.map((item) => item.content)
    : ['', '', ''];
}

async function load(
  options: { silent?: boolean; resetDrafts?: boolean } = {},
): Promise<void> {
  const silent = options.silent ?? false;
  const resetDrafts = options.resetDrafts ?? !silent;

  if (!silent) {
    loading.value = true;
    error.value = '';
  }

  try {
    const data = await fetchTask(taskId.value);
    task.value = data;
    if (resetDrafts) {
      syncDraft(data);
    }
  } catch (value: unknown) {
    const message = readApiError(value, '加载任务失败，请稍后重试。');
    if (silent) {
      ElMessage.error(message);
    } else {
      error.value = message;
    }
  } finally {
    if (!silent) {
      loading.value = false;
    }
  }
}

async function loadDecisions(): Promise<void> {
  try {
    decisions.value = await fetchDecisions({ taskId: taskId.value });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '加载关联决策失败，请稍后重试。'));
  }
}

function addCriterion(): void {
  criteriaDraft.value.push('');
}

function removeCriterion(index: number): void {
  criteriaDraft.value.splice(index, 1);
  if (!criteriaDraft.value.length) {
    criteriaDraft.value.push('');
  }
}

async function doPersist(): Promise<boolean> {
  if (!task.value || !canEdit.value) {
    return false;
  }

  const title = titleDraft.value.trim();
  if (!title) {
    ElMessage.warning('任务标题不能为空');
    return false;
  }

  // 请求发出前同步取快照，避免网络往返期间的新编辑被混进这次保存
  const spec = specDraft.value;
  const manualNote = noteDraft.value;
  const criteria = draftCriteria.value.slice();

  saving.value = true;
  let contentSaved = false;
  let criteriaSaved = false;

  try {
    try {
      await updateTask(taskId.value, { title, spec, manualNote });
      contentSaved = true;
    } catch (value: unknown) {
      ElMessage.error(readApiError(value, '任务内容保存失败，请稍后重试。'));
    }

    // 基础内容没保存成功时不再动验收标准，避免只改一半
    if (contentSaved) {
      try {
        await replaceCriteria(taskId.value, criteria);
        criteriaSaved = true;
      } catch (value: unknown) {
        ElMessage.error(
          readApiError(
            value,
            '基础内容已保存，验收标准保存失败，请稍后重试。',
          ),
        );
      }
    }

    return contentSaved && criteriaSaved;
  } finally {
    saving.value = false;
    // 内容已落库时以服务端为准；不重置草稿，保存期间的新编辑会留在输入框里
    if (contentSaved) {
      await load({ silent: true, resetDrafts: false });
    }
  }
}

/** 同一时间只允许一次保存；流转前的自动保存会复用进行中的请求 */
let savingPromise: Promise<boolean> | null = null;

function persistOnce(): Promise<boolean> {
  if (!savingPromise) {
    savingPromise = doPersist()
      .catch(() => false)
      .finally(() => {
        savingPromise = null;
      });
  }
  return savingPromise;
}

/**
 * 保存到没有未保存修改为止。
 * 保存期间用户继续编辑时，等这一轮结束再提交一轮，避免静默丢弃。
 */
async function persistDrafts(): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (savingPromise) {
      const ok = await savingPromise;
      if (!ok) {
        return false;
      }
      continue;
    }

    if (!hasUnsavedChanges.value) {
      return true;
    }

    const ok = await persistOnce();
    if (!ok) {
      return false;
    }
  }

  return !hasUnsavedChanges.value;
}

async function save(): Promise<void> {
  if (await persistDrafts()) {
    ElMessage.success('已保存');
  }
}

async function applyTransition(item: AvailableTransition): Promise<void> {
  if (!task.value || !canEdit.value || transitioningTo.value) {
    return;
  }

  transitioningTo.value = item.to;
  try {
    // 有未保存的修改时先落库，保存失败则中止流转
    if (hasUnsavedChanges.value) {
      const saved = await persistDrafts();
      if (!saved) {
        return;
      }
    }

    await transitionTask(taskId.value, {
      to: item.to,
      note: transitionNote.value.trim() || undefined,
    });
    transitionNote.value = '';
    ElMessage.success(`已流转到「${TASK_STATUS_LABELS[item.to]}」`);
    // 流转后刷新门禁与候选操作，但保留用户还没保存的编辑内容
    await load({ silent: true, resetDrafts: false });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '流转失败，请稍后重试。'));
  } finally {
    transitioningTo.value = null;
  }
}

async function removeTask(): Promise<void> {
  const current = task.value;
  if (!current || !canEdit.value || deletingTask.value) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      `删除任务「${current.title}」及其验证记录、AI 会话和流转历史，操作无法撤销。`,
      '删除任务',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }

  deletingTask.value = true;
  try {
    await deleteTask(current.id);
    ElMessage.success('任务已删除');
    await router.push({
      name: 'project-detail',
      params: { id: current.project.id },
    });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '删除任务失败，请稍后重试。'));
  } finally {
    deletingTask.value = false;
  }
}

function openVerificationForm(): void {
  verificationForm.command = '';
  verificationForm.result = 'passed';
  verificationForm.evidenceUrl = '';
  verificationForm.note = '';
  verificationFormOpen.value = true;
}

async function submitVerification(): Promise<void> {
  if (!canEdit.value || savingVerification.value) {
    return;
  }

  const command = verificationForm.command.trim();
  if (!command) {
    ElMessage.warning('请填写执行命令');
    return;
  }

  savingVerification.value = true;
  try {
    await createVerification(taskId.value, {
      command,
      result: verificationForm.result,
      evidenceUrl: verificationForm.evidenceUrl.trim() || undefined,
      note: verificationForm.note.trim() || undefined,
    });
    ElMessage.success('验证记录已添加');
    verificationFormOpen.value = false;
    // 记录变化会影响门禁与流转按钮，统一以服务端最新详情为准
    await load({ silent: true, resetDrafts: false });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '添加验证记录失败，请稍后重试。'));
  } finally {
    savingVerification.value = false;
  }
}

async function removeVerification(record: VerificationView): Promise<void> {
  if (!canEdit.value) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认删除命令「${record.command}」的验证记录？`,
      '删除验证记录',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }

  deletingVerificationId.value = record.id;
  try {
    await deleteVerification(taskId.value, record.id);
    ElMessage.success('验证记录已删除');
    await load({ silent: true, resetDrafts: false });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '删除验证记录失败，请稍后重试。'));
  } finally {
    deletingVerificationId.value = null;
  }
}

function openAiSessionForm(): void {
  aiSessionForm.title = '';
  aiSessionForm.tool = '';
  aiSessionForm.summary = '';
  aiSessionFormOpen.value = true;
}

async function submitAiSession(): Promise<void> {
  if (!canEdit.value || savingAiSession.value) {
    return;
  }

  const title = aiSessionForm.title.trim();
  if (!title) {
    ElMessage.warning('请填写会话标题');
    return;
  }

  savingAiSession.value = true;
  try {
    await createAiSession(taskId.value, {
      title,
      tool: aiSessionForm.tool.trim() || undefined,
      summary: aiSessionForm.summary.trim() || undefined,
    });
    ElMessage.success('AI 会话已添加');
    aiSessionFormOpen.value = false;
    await load({ silent: true, resetDrafts: false });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '添加 AI 会话失败，请稍后重试。'));
  } finally {
    savingAiSession.value = false;
  }
}

async function removeAiSession(session: AiSessionView): Promise<void> {
  if (!canEdit.value) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认删除 AI 会话「${session.title}」？`,
      '删除 AI 会话',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }

  deletingAiSessionId.value = session.id;
  try {
    await deleteAiSession(taskId.value, session.id);
    ElMessage.success('AI 会话已删除');
    await load({ silent: true, resetDrafts: false });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '删除 AI 会话失败，请稍后重试。'));
  } finally {
    deletingAiSessionId.value = null;
  }
}

function transitionLabel(item: AvailableTransition): string {
  return `流转到「${TASK_STATUS_LABELS[item.to]}」`;
}

onMounted(() => {
  void load();
  void loadDecisions();
});
</script>

<template>
  <div class="task-detail">
    <router-link
      :to="task ? `/projects/${task.project.id}` : '/projects'"
      class="back-link"
    >
      ← 返回项目
    </router-link>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      show-icon
    >
      <div class="alert-body">
        <el-button size="small" @click="load()">重新加载</el-button>
      </div>
    </el-alert>

    <div v-if="loading" class="state">正在加载任务…</div>

    <template v-else-if="task">
      <header class="page-head">
        <div class="head-top">
          <p class="eyebrow">任务</p>
          <el-button
            v-if="canEdit"
            class="delete-task"
            text
            type="danger"
            :loading="deletingTask"
            @click="removeTask"
          >
            删除任务
          </el-button>
        </div>
        <div class="title-row">
          <el-input
            v-if="canEdit"
            v-model="titleDraft"
            class="title-input"
            maxlength="120"
            aria-label="任务标题"
            placeholder="任务标题"
          />
          <h1 v-else>{{ task.title }}</h1>
          <el-tag
            v-if="hasUnsavedChanges"
            class="unsaved-tag"
            size="small"
            type="warning"
            effect="plain"
          >
            未保存
          </el-tag>
        </div>
        <div class="head-meta">
          <el-tag effect="dark" :type="statusTagType(task.status)">
            {{ TASK_STATUS_LABELS[task.status] }}
          </el-tag>
          <router-link
            :to="`/projects/${task.project.id}`"
            class="project-link"
          >
            {{ task.project.name }}
          </router-link>
          <span class="updated">更新于 {{ formatDateTime(task.updatedAt) }}</span>
        </div>
      </header>

      <div class="task-layout">
        <section class="left">
          <el-card class="card" shadow="never">
            <template #header>
              <div class="card-head">
                <span>规格</span>
                <span class="card-kicker">至少 {{ SPEC_MIN_LENGTH }} 字</span>
              </div>
            </template>

            <div class="field">
              <div class="field-head">
                <label for="task-spec-input">任务规格</label>
                <span :class="{ ok: specDraftLength >= SPEC_MIN_LENGTH }">
                  {{ specDraftLength }} / {{ SPEC_MIN_LENGTH }} 字
                </span>
              </div>
              <el-input
                id="task-spec-input"
                v-model="specDraft"
                type="textarea"
                :rows="7"
                :disabled="!canEdit"
                aria-label="任务规格"
                placeholder="写清楚要做什么、边界是什么、怎样算做完。进入开发前至少 20 字。"
              />
            </div>

            <div class="field">
              <div class="field-head">
                <label for="task-note-input">人工记录</label>
                <span :class="{ ok: noteDraftLength >= MANUAL_NOTE_MIN_LENGTH }">
                  {{ noteDraftLength }} / {{ MANUAL_NOTE_MIN_LENGTH }} 字
                </span>
              </div>
              <el-input
                id="task-note-input"
                v-model="noteDraft"
                type="textarea"
                :rows="4"
                :disabled="!canEdit"
                aria-label="人工记录"
                placeholder="记录人工判断、命令行验证或决策过程。标记完成时，AI 会话或不少于 20 字的人工记录必须有一个。"
              />
              <p class="hint">
                标记完成时，至少需要 1 条通过的验证；追溯上至少 1 条 AI 会话或不少于
                {{ MANUAL_NOTE_MIN_LENGTH }} 字的人工记录，满足其一即可。
              </p>
            </div>
          </el-card>

          <el-card class="card" shadow="never">
            <template #header>
              <div class="card-head">
                <span>验收标准</span>
                <span class="card-kicker">
                  已填写 {{ criteriaFilledCount }} 条
                </span>
              </div>
            </template>

            <div class="criteria-editor">
              <div
                v-for="(_, index) in criteriaDraft"
                :key="index"
                class="criterion-row"
              >
                <span class="criterion-index">{{ index + 1 }}</span>
                <el-input
                  v-model="criteriaDraft[index]"
                  :disabled="!canEdit"
                  placeholder="一条可验证的验收标准"
                />
                <el-button
                  v-if="canEdit"
                  text
                  type="danger"
                  @click="removeCriterion(index)"
                >
                  删除
                </el-button>
              </div>

              <el-button v-if="canEdit" text type="primary" @click="addCriterion">
                + 添加一条
              </el-button>
            </div>

            <p class="hint">
              进入「待开发」前至少需要 {{ ACCEPTANCE_MIN_COUNT }} 条非空验收标准，空行不会提交。
            </p>
          </el-card>

          <div v-if="canEdit" class="save-bar">
            <span class="hint" :class="{ 'hint--dirty': hasUnsavedChanges }">
              {{
                hasUnsavedChanges
                  ? '有未保存的修改，流转前会自动保存。'
                  : '修改标题、规格、验收标准或人工记录后请保存。'
              }}
            </span>
            <el-button type="primary" :loading="saving" @click="save">
              保存修改
            </el-button>
          </div>

          <el-card class="card" shadow="never">
            <template #header>
              <div class="card-head">
                <span>验证记录</span>
                <span class="card-kicker">{{ verifications.length }} 条</span>
              </div>
            </template>

            <p v-if="!verifications.length" class="muted">
              还没有验证记录。标记完成前至少要有一条通过的验证。
            </p>

            <div v-else class="record-list">
              <article
                v-for="record in verifications"
                :key="record.id"
                class="record-item"
              >
                <div class="record-head">
                  <el-tag
                    size="small"
                    effect="plain"
                    :type="verificationTagType(record.result)"
                  >
                    {{ verificationResultLabel(record.result) }}
                  </el-tag>
                  <code class="record-command">{{ record.command }}</code>
                  <el-button
                    v-if="canEdit"
                    class="record-delete"
                    text
                    type="danger"
                    size="small"
                    :loading="deletingVerificationId === record.id"
                    @click="removeVerification(record)"
                  >
                    删除
                  </el-button>
                </div>
                <p v-if="record.note" class="record-note">{{ record.note }}</p>
                <div class="record-meta">
                  <a
                    v-if="isHttpUrl(record.evidenceUrl)"
                    :href="record.evidenceUrl ?? undefined"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="evidence-link"
                  >
                    查看证据
                  </a>
                  <span
                    v-else-if="record.evidenceUrl"
                    class="evidence-link evidence-link--plain"
                    :title="record.evidenceUrl"
                  >
                    证据链接不可用
                  </span>
                  <span>{{ record.createdBy?.name ?? '—' }}</span>
                  <time>{{ formatDateTime(record.createdAt) }}</time>
                </div>
              </article>
            </div>

            <div class="record-actions">
              <el-button
                v-if="canEdit"
                text
                type="primary"
                @click="openVerificationForm"
              >
                + 添加验证记录
              </el-button>
            </div>

            <el-form
              v-if="verificationFormOpen"
              class="record-form"
              label-position="top"
              @submit.prevent="submitVerification"
            >
              <div class="form-grid">
                <el-form-item label="命令" required>
                  <el-input
                    v-model="verificationForm.command"
                    maxlength="500"
                    show-word-limit
                    placeholder="例如：pnpm test"
                  />
                </el-form-item>
                <el-form-item label="结果" required>
                  <el-select
                    v-model="verificationForm.result"
                    style="width: 100%"
                  >
                    <el-option label="通过" value="passed" />
                    <el-option label="未通过" value="failed" />
                  </el-select>
                </el-form-item>
              </div>

              <el-form-item label="证据链接（可选）">
                <el-input
                  v-model="verificationForm.evidenceUrl"
                  maxlength="1000"
                  placeholder="https://..."
                />
              </el-form-item>

              <el-form-item label="备注（可选）">
                <el-input
                  v-model="verificationForm.note"
                  type="textarea"
                  :rows="2"
                  maxlength="5000"
                  show-word-limit
                  placeholder="失败原因、复现步骤或补充说明"
                />
              </el-form-item>

              <div class="form-actions">
                <el-button @click="verificationFormOpen = false">
                  取消
                </el-button>
                <el-button
                  type="primary"
                  :loading="savingVerification"
                  @click="submitVerification"
                >
                  保存记录
                </el-button>
              </div>
            </el-form>
          </el-card>

          <el-card class="card" shadow="never">
            <template #header>
              <div class="card-head">
                <span>AI 会话</span>
                <span class="card-kicker">{{ aiSessions.length }} 条</span>
              </div>
            </template>

            <p v-if="!aiSessions.length" class="muted">
              还没有 AI 会话。至少一条会话可以满足完成时的追溯要求。
            </p>

            <div v-else class="record-list">
              <article
                v-for="session in aiSessions"
                :key="session.id"
                class="record-item"
              >
                <div class="record-head">
                  <strong class="record-title">{{ session.title }}</strong>
                  <el-button
                    v-if="canEdit"
                    class="record-delete"
                    text
                    type="danger"
                    size="small"
                    :loading="deletingAiSessionId === session.id"
                    @click="removeAiSession(session)"
                  >
                    删除
                  </el-button>
                </div>
                <p v-if="session.summary" class="record-note">
                  {{ session.summary }}
                </p>
                <div class="record-meta">
                  <span>工具：{{ session.tool || '—' }}</span>
                  <span>{{ session.createdBy?.name ?? '—' }}</span>
                  <time>{{ formatDateTime(session.createdAt) }}</time>
                </div>
              </article>
            </div>

            <div class="record-actions">
              <el-button
                v-if="canEdit"
                text
                type="primary"
                @click="openAiSessionForm"
              >
                + 添加 AI 会话
              </el-button>
            </div>

            <el-form
              v-if="aiSessionFormOpen"
              class="record-form"
              label-position="top"
              @submit.prevent="submitAiSession"
            >
              <el-form-item label="标题" required>
                <el-input
                  v-model="aiSessionForm.title"
                  maxlength="200"
                  show-word-limit
                  placeholder="例如：Claude Code 实现完成门禁"
                />
              </el-form-item>

              <el-form-item label="工具（可选）">
                <el-input
                  v-model="aiSessionForm.tool"
                  maxlength="100"
                  placeholder="例如：Claude Code"
                />
              </el-form-item>

              <el-form-item label="摘要（可选）">
                <el-input
                  v-model="aiSessionForm.summary"
                  type="textarea"
                  :rows="2"
                  maxlength="5000"
                  show-word-limit
                  placeholder="会话做了什么、结论是什么"
                />
              </el-form-item>

              <div class="form-actions">
                <el-button @click="aiSessionFormOpen = false">取消</el-button>
                <el-button
                  type="primary"
                  :loading="savingAiSession"
                  @click="submitAiSession"
                >
                  保存会话
                </el-button>
              </div>
            </el-form>
          </el-card>

          <el-card
            v-if="decisions.length"
            class="card decision-card"
            shadow="never"
          >
            <template #header>
              <div class="card-head">
                <span>关联决策</span>
                <span class="card-kicker">只读 · {{ decisions.length }} 条</span>
              </div>
            </template>

            <div class="decision-list">
              <article
                v-for="item in decisions"
                :key="item.id"
                class="decision-item"
              >
                <div class="decision-head">
                  <router-link
                    :to="`/projects/${item.projectId}`"
                    class="decision-title"
                  >
                    {{ item.title }}
                  </router-link>
                  <el-tag
                    size="small"
                    effect="plain"
                    :type="decisionStatusTagType(item.status)"
                  >
                    {{ DECISION_STATUS_LABELS[item.status] }}
                  </el-tag>
                </div>
                <div class="decision-meta">
                  <span>项目：{{ item.project.name }}</span>
                  <time>{{ formatDateTime(item.updatedAt) }}</time>
                </div>
              </article>
            </div>
          </el-card>
        </section>

        <aside class="right">
          <el-card class="card gate-card" shadow="never">
            <template #header>
              <div class="card-head">
                <span>任务门禁</span>
                <span class="card-kicker">以服务端校验为准</span>
              </div>
            </template>

            <p v-if="hasUnsavedChanges" class="gate-stale">
              有未保存的修改，保存后门禁状态会同步更新。
            </p>

            <div class="gate-list">
              <div class="gate-item">
                <div class="gate-row">
                  <span>规格字数</span>
                  <strong :class="gate.specOk ? 'ok' : 'bad'">
                    {{ gate.specLength }} / {{ SPEC_MIN_LENGTH }}
                  </strong>
                </div>
                <el-progress
                  :percentage="specGatePercent"
                  :status="gate.specOk ? 'success' : 'warning'"
                  :show-text="false"
                  :stroke-width="6"
                />
                <p class="gate-result" :class="gate.specOk ? 'ok' : 'bad'">
                  {{ gate.specOk ? '已达标' : '未达标' }}
                </p>
              </div>

              <div class="gate-item">
                <div class="gate-row">
                  <span>验收条数</span>
                  <strong :class="gate.criteriaOk ? 'ok' : 'bad'">
                    {{ gate.criteriaCount }} / {{ ACCEPTANCE_MIN_COUNT }}
                  </strong>
                </div>
                <el-progress
                  :percentage="criteriaGatePercent"
                  :status="gate.criteriaOk ? 'success' : 'warning'"
                  :show-text="false"
                  :stroke-width="6"
                />
                <p class="gate-result" :class="gate.criteriaOk ? 'ok' : 'bad'">
                  {{ gate.criteriaOk ? '已达标' : '未达标' }}
                </p>
              </div>

              <div class="gate-item">
                <div class="gate-row">
                  <span>通过验证数</span>
                  <strong :class="gate.verificationOk ? 'ok' : 'bad'">
                    {{ gate.passedVerifications }} / 1
                  </strong>
                </div>
                <el-progress
                  :percentage="verificationGatePercent"
                  :status="gate.verificationOk ? 'success' : 'warning'"
                  :show-text="false"
                  :stroke-width="6"
                />
                <p
                  class="gate-result"
                  :class="gate.verificationOk ? 'ok' : 'bad'"
                >
                  {{ gate.verificationOk ? '已达标' : '未达标' }}
                </p>
              </div>

              <div class="gate-item">
                <div class="gate-row">
                  <span>追溯</span>
                  <strong
                    class="wide"
                    :class="gate.traceabilityOk ? 'ok' : 'bad'"
                  >
                    AI 会话 {{ gate.aiSessionCount }} 条 / 人工记录
                    {{ gate.manualNoteLength }} / {{ MANUAL_NOTE_MIN_LENGTH }}
                    字
                  </strong>
                </div>
                <p
                  class="gate-result"
                  :class="gate.traceabilityOk ? 'ok' : 'bad'"
                >
                  {{ gate.traceabilityOk ? '已达标' : '未达标' }}
                </p>
              </div>
            </div>

            <p class="gate-note">
              门禁状态以服务端校验为准；修改内容并保存后，此处会同步更新。
            </p>
          </el-card>

          <el-card class="card transition-card" shadow="never">
            <template #header>
              <div class="card-head">
                <span>状态流转</span>
                <span class="card-kicker">当前可执行的操作</span>
              </div>
            </template>

            <p v-if="!canWrite" class="muted">
              当前账号只有查看权限，不能编辑或流转任务。
            </p>

            <template v-else>
              <el-input
                v-model="transitionNote"
                type="textarea"
                :rows="2"
                maxlength="200"
                show-word-limit
                placeholder="流转备注（可选）"
                class="note-input"
              />

              <p v-if="hasUnsavedChanges" class="hint transition-hint">
                有未保存的修改，点击后先保存，再以服务端校验结果为准。
              </p>

              <div v-if="transitions.length" class="transition-list">
                <div
                  v-for="item in transitions"
                  :key="item.to"
                  class="transition-item"
                >
                  <el-button
                    class="transition-btn"
                    :type="
                      isForwardTransition(currentStatus, item.to)
                        ? 'primary'
                        : 'default'
                    "
                    :plain="!isForwardTransition(currentStatus, item.to)"
                    :disabled="!hasUnsavedChanges && !item.allowed"
                    :loading="transitioningTo === item.to"
                    @click="applyTransition(item)"
                  >
                    {{ transitionLabel(item) }}
                  </el-button>

                  <ul
                    v-if="!hasUnsavedChanges && item.reasons.length"
                    class="reasons"
                  >
                    <li v-for="reason in item.reasons" :key="reason">
                      {{ reason }}
                    </li>
                  </ul>
                </div>
              </div>

              <p v-else class="muted">已完成的任务没有后续流转。</p>
            </template>
          </el-card>
        </aside>
      </div>

      <el-card class="card timeline-card" shadow="never">
        <template #header>
          <div class="card-head">
            <span>流转记录</span>
            <span class="card-kicker">{{ transitionRecords.length }} 条</span>
          </div>
        </template>

        <p v-if="!transitionRecords.length" class="muted">还没有流转记录。</p>

        <ol v-else class="timeline">
          <li v-for="record in transitionRecords" :key="record.id">
            <span class="timeline-dot" aria-hidden="true" />
            <div class="timeline-body">
              <div class="timeline-head">
                <strong>{{ record.actor.name }}</strong>
                <span class="flow">
                  <template v-if="record.fromStatus">
                    {{ TASK_STATUS_LABELS[record.fromStatus] }} →
                  </template>
                  {{ TASK_STATUS_LABELS[record.toStatus] }}
                </span>
                <time>{{ formatDateTime(record.createdAt) }}</time>
              </div>
              <p v-if="record.note" class="timeline-note">{{ record.note }}</p>
            </div>
          </li>
        </ol>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.task-detail {
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
  display: grid;
  gap: 8px;
}

.head-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.delete-task {
  flex: none;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.title-input {
  flex: 1;
  min-width: 0;
}

.title-input :deep(.el-input__wrapper) {
  padding: 0 4px;
  background: transparent;
  box-shadow: none;
}

.title-input :deep(.el-input__wrapper:hover),
.title-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #d7dfeb inset;
}

.title-input :deep(.el-input__inner) {
  height: 40px;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: #18202f;
}

.unsaved-tag {
  flex: none;
}

.eyebrow {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #2f6fed;
}

h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: #18202f;
  overflow-wrap: anywhere;
}

.head-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 12.5px;
  color: #7c8799;
}

.project-link {
  color: #1f3a5f;
  font-weight: 500;
  text-decoration: none;
}

.project-link:hover {
  color: #2f6fed;
  text-decoration: underline;
}

.updated {
  color: #9aa4b5;
  font-variant-numeric: tabular-nums;
}

.task-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
  align-items: start;
}

.left,
.right {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.card {
  border: 1px solid #e1e6ef;
  border-radius: 14px;
  background: #fff;
}

.card :deep(.el-card__header) {
  padding: 14px 18px;
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

.field + .field {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed #edf0f5;
}

.field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 7px;
}

.field-head label {
  font-size: 12.5px;
  font-weight: 600;
  color: #3d4a5e;
}

.field-head span {
  font-size: 11.5px;
  color: #9aa4b5;
  font-variant-numeric: tabular-nums;
}

.field-head span.ok {
  color: #1f9d6a;
}

.hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: #9aa4b5;
}

.hint--dirty {
  color: #b7791f;
}

.criteria-editor {
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

.save-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border: 1px solid #e1e6ef;
  border-radius: 14px;
  background: #fff;
}

.save-bar .hint {
  margin: 0;
}

.save-bar :deep(.el-button) {
  flex: none;
}

.gate-stale {
  margin: 0 0 14px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fdf6e8;
  font-size: 11.5px;
  line-height: 1.6;
  color: #b7791f;
}

.gate-list {
  display: grid;
  gap: 16px;
}

.gate-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 7px;
  font-size: 12.5px;
  color: #3d4a5e;
}

.gate-row strong {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.gate-row strong.ok,
.gate-result.ok {
  color: #1f9d6a;
}

.gate-row strong.bad,
.gate-result.bad {
  color: #b7791f;
}

.gate-result {
  margin: 5px 0 0;
  font-size: 11.5px;
}

.gate-note {
  margin: 16px 0 0;
  padding-top: 13px;
  border-top: 1px dashed #edf0f5;
  font-size: 11.5px;
  line-height: 1.7;
  color: #5c687b;
}

.note-input {
  margin-bottom: 12px;
}

.transition-hint {
  margin: 0 0 12px;
  color: #b7791f;
}

.transition-list {
  display: grid;
  gap: 12px;
}

.transition-item {
  display: grid;
  gap: 6px;
}

.transition-btn {
  width: 100%;
}

.reasons {
  margin: 0;
  padding-left: 16px;
  display: grid;
  gap: 3px;
  font-size: 11.5px;
  line-height: 1.6;
  color: #b7791f;
}

.muted {
  margin: 0;
  padding: 4px 0;
  font-size: 12.5px;
  line-height: 1.7;
  color: #9aa4b5;
}

.gate-row strong.wide {
  max-width: 190px;
  font-size: 11.5px;
  line-height: 1.5;
  text-align: right;
}

.record-list {
  display: grid;
  gap: 12px;
}

.record-item {
  padding: 12px 14px;
  border: 1px solid #edf0f5;
  border-radius: 10px;
  background: #fbfcfe;
}

.record-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.record-command {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #1f3a5f;
  overflow-wrap: anywhere;
}

.record-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #18202f;
  overflow-wrap: anywhere;
}

.record-delete {
  flex: none;
  margin-left: auto;
}

.record-note {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: #4c586c;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.record-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  margin-top: 8px;
  font-size: 11.5px;
  color: #5c687b;
}

.record-meta time {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.evidence-link {
  max-width: 100%;
  color: #2f6fed;
  text-decoration: none;
  overflow-wrap: anywhere;
  word-break: break-all;
}

.evidence-link--plain {
  color: #9aa4b5;
  text-decoration: none;
}

.evidence-link:hover {
  text-decoration: underline;
}

.decision-list {
  display: grid;
  gap: 10px;
}

.decision-item {
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid #edf0f5;
  border-radius: 10px;
  background: #fbfcfe;
}

.decision-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.decision-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1f3a5f;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.decision-title:hover {
  color: #2f6fed;
  text-decoration: underline;
}

.decision-text {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: #4c586c;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.decision-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  margin-top: 8px;
  font-size: 11.5px;
  color: #9aa4b5;
}

.decision-meta time {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.record-actions {
  margin-top: 12px;
}

.record-form {
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px dashed #edf0f5;
}

.record-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  gap: 12px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.timeline-card :deep(.el-card__body) {
  padding: 18px 18px 8px;
}

.timeline {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0;
}

.timeline li {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  padding-bottom: 18px;
}

.timeline li::before {
  content: '';
  position: absolute;
  top: 14px;
  bottom: -2px;
  left: 6px;
  width: 1px;
  background: #e1e6ef;
}

.timeline li:last-child {
  padding-bottom: 4px;
}

.timeline li:last-child::before {
  display: none;
}

.timeline-dot {
  position: relative;
  z-index: 1;
  width: 13px;
  height: 13px;
  margin-top: 3px;
  border-radius: 50%;
  border: 2px solid #b9c9e4;
  background: #fff;
}

.timeline-body {
  min-width: 0;
}

.timeline-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  font-size: 12.5px;
  color: #4c586c;
}

.timeline-head strong {
  color: #18202f;
  font-weight: 600;
}

.flow {
  color: #1f3a5f;
}

.timeline-head time {
  margin-left: auto;
  font-size: 11.5px;
  color: #9aa4b5;
  font-variant-numeric: tabular-nums;
}

.timeline-note {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: #7c8799;
  overflow-wrap: anywhere;
}

.state {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: #8a95a7;
}

.alert-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

@media (max-width: 860px) {
  .task-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  h1 {
    font-size: 24px;
  }

  .title-input :deep(.el-input__inner) {
    font-size: 24px;
  }

  .save-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .timeline-head time {
    margin-left: 0;
    flex-basis: 100%;
  }
}

@media (max-width: 520px) {
  .criterion-row {
    grid-template-columns: 18px minmax(0, 1fr);
  }

  .criterion-row :deep(.el-button) {
    grid-column: 2;
    justify-self: start;
    padding-left: 0;
  }

  .form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .record-meta time {
    margin-left: 0;
  }

  .decision-meta time {
    margin-left: 0;
  }

  .gate-row strong.wide {
    max-width: 100%;
  }
}
</style>
