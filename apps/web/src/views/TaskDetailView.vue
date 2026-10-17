<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  ACCEPTANCE_MIN_COUNT,
  MANUAL_NOTE_MIN_LENGTH,
  SPEC_MIN_LENGTH,
  TASK_STATUS_LABELS,
  type AvailableTransition,
  type TaskStatus,
} from '@vibe/shared';
import {
  fetchTask,
  replaceCriteria,
  transitionTask,
  updateTask,
  type TaskDetail,
} from '@/api/tasks';
import { useAuthStore } from '@/stores/auth';
import { readApiError } from '@/utils/api-error';
import { formatDateTime } from '@/utils/format';
import { isForwardTransition, statusTagType } from '@/utils/task-status';

const auth = useAuthStore();
const route = useRoute();

const taskId = computed(() => String(route.params.id));

const task = ref<TaskDetail | null>(null);
const loading = ref(true);
const error = ref('');

const specDraft = ref('');
const noteDraft = ref('');
const criteriaDraft = ref<string[]>([]);
const transitionNote = ref('');

const saving = ref(false);
const transitioningTo = ref<TaskStatus | null>(null);

const canWrite = computed(() => auth.hasPermission('task:write'));
const currentStatus = computed<TaskStatus>(
  () => task.value?.status ?? 'draft',
);
const transitions = computed<AvailableTransition[]>(
  () => task.value?.availableTransitions ?? [],
);

const specDraftLength = computed(() => specDraft.value.trim().length);
const noteDraftLength = computed(() => noteDraft.value.trim().length);
const criteriaFilledCount = computed(
  () => criteriaDraft.value.filter((item) => item.trim().length > 0).length,
);

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

function syncDraft(value: TaskDetail): void {
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

function addCriterion(): void {
  criteriaDraft.value.push('');
}

function removeCriterion(index: number): void {
  criteriaDraft.value.splice(index, 1);
  if (!criteriaDraft.value.length) {
    criteriaDraft.value.push('');
  }
}

async function save(): Promise<void> {
  if (!task.value || !canWrite.value) {
    return;
  }

  saving.value = true;
  try {
    const criteria = criteriaDraft.value
      .map((item) => item.trim())
      .filter(Boolean);

    await updateTask(taskId.value, {
      spec: specDraft.value,
      manualNote: noteDraft.value,
    });
    await replaceCriteria(taskId.value, criteria);

    ElMessage.success('已保存');
    await load({ silent: true, resetDrafts: true });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '保存失败，请稍后重试。'));
  } finally {
    saving.value = false;
  }
}

async function applyTransition(item: AvailableTransition): Promise<void> {
  if (!task.value || !canWrite.value || !item.allowed) {
    return;
  }

  transitioningTo.value = item.to;
  try {
    await transitionTask(taskId.value, {
      to: item.to,
      note: transitionNote.value.trim() || undefined,
    });
    transitionNote.value = '';
    ElMessage.success(`已流转到「${TASK_STATUS_LABELS[item.to]}」`);
    // 流转后刷新门禁与候选按钮，但保留用户还没保存的编辑内容
    await load({ silent: true, resetDrafts: false });
  } catch (value: unknown) {
    ElMessage.error(readApiError(value, '流转失败，请稍后重试。'));
  } finally {
    transitioningTo.value = null;
  }
}

function transitionLabel(item: AvailableTransition): string {
  return `流转到「${TASK_STATUS_LABELS[item.to]}」`;
}

onMounted(load);
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
    />

    <div v-if="loading" class="state">正在加载任务…</div>

    <template v-else-if="task">
      <header class="page-head">
        <p class="eyebrow">Task · 任务</p>
        <h1>{{ task.title }}</h1>
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
                <span class="card-kicker">spec</span>
              </div>
            </template>

            <div class="field">
              <div class="field-head">
                <label>任务规格</label>
                <span :class="{ ok: specDraftLength >= SPEC_MIN_LENGTH }">
                  {{ specDraftLength }} / {{ SPEC_MIN_LENGTH }} 字
                </span>
              </div>
              <el-input
                v-model="specDraft"
                type="textarea"
                :rows="7"
                :disabled="!canWrite"
                placeholder="写清楚要做什么、边界是什么、怎样算做完。进入开发前至少 20 字。"
              />
            </div>

            <div class="field">
              <div class="field-head">
                <label>人工记录</label>
                <span :class="{ ok: noteDraftLength >= MANUAL_NOTE_MIN_LENGTH }">
                  {{ noteDraftLength }} / {{ MANUAL_NOTE_MIN_LENGTH }} 字
                </span>
              </div>
              <el-input
                v-model="noteDraft"
                type="textarea"
                :rows="4"
                :disabled="!canWrite"
                placeholder="记录人工判断、命令行验证或决策过程。标记完成时，AI 会话或不少于 20 字的人工记录必须有一个。"
              />
              <p class="hint">
                Day 2 还没有 AI 会话模型，追溯门禁只能靠这段人工记录满足。
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
                  :disabled="!canWrite"
                  placeholder="一条可验证的验收标准"
                />
                <el-button
                  v-if="canWrite"
                  text
                  type="danger"
                  @click="removeCriterion(index)"
                >
                  删除
                </el-button>
              </div>

              <el-button v-if="canWrite" text type="primary" @click="addCriterion">
                + 添加一条
              </el-button>
            </div>

            <p class="hint">
              进入「待开发」前至少需要 {{ ACCEPTANCE_MIN_COUNT }} 条非空验收标准，空行不会提交。
            </p>
          </el-card>

          <div v-if="canWrite" class="save-bar">
            <span class="hint">
              保存会调用 PATCH 更新规格与人工记录，并整体替换验收标准。
            </span>
            <el-button type="primary" :loading="saving" @click="save">
              保存修改
            </el-button>
          </div>
        </section>

        <aside class="right">
          <el-card class="card gate-card" shadow="never">
            <template #header>
              <div class="card-head">
                <span>规格门禁</span>
                <span class="card-kicker">服务端判定</span>
              </div>
            </template>

            <div class="gate-list">
              <div class="gate-item">
                <div class="gate-row">
                  <span>规格字数</span>
                  <strong :class="task.gate.specOk ? 'ok' : 'bad'">
                    {{ task.gate.specLength }} / {{ SPEC_MIN_LENGTH }}
                  </strong>
                </div>
                <el-progress
                  :percentage="specGatePercent"
                  :status="task.gate.specOk ? 'success' : 'warning'"
                  :show-text="false"
                  :stroke-width="6"
                />
                <p class="gate-result" :class="task.gate.specOk ? 'ok' : 'bad'">
                  {{ task.gate.specOk ? '已达标' : '未达标' }}
                </p>
              </div>

              <div class="gate-item">
                <div class="gate-row">
                  <span>验收条数</span>
                  <strong :class="task.gate.criteriaOk ? 'ok' : 'bad'">
                    {{ task.gate.criteriaCount }} / {{ ACCEPTANCE_MIN_COUNT }}
                  </strong>
                </div>
                <el-progress
                  :percentage="criteriaGatePercent"
                  :status="task.gate.criteriaOk ? 'success' : 'warning'"
                  :show-text="false"
                  :stroke-width="6"
                />
                <p class="gate-result" :class="task.gate.criteriaOk ? 'ok' : 'bad'">
                  {{ task.gate.criteriaOk ? '已达标' : '未达标' }}
                </p>
              </div>
            </div>

            <p class="gate-note">
              门禁由服务端与 @vibe/shared 的同一份策略计算，前端只展示结果，不自行判断。
            </p>
          </el-card>

          <el-card class="card transition-card" shadow="never">
            <template #header>
              <div class="card-head">
                <span>状态流转</span>
                <span class="card-kicker">availableTransitions</span>
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
                    :disabled="!item.allowed"
                    :loading="transitioningTo === item.to"
                    @click="applyTransition(item)"
                  >
                    {{ transitionLabel(item) }}
                  </el-button>

                  <ul v-if="item.reasons.length" class="reasons">
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
            <span class="card-kicker">{{ task.transitions.length }} 条</span>
          </div>
        </template>

        <p v-if="!task.transitions.length" class="muted">还没有流转记录。</p>

        <ol v-else class="timeline">
          <li v-for="record in task.transitions" :key="record.id">
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
  color: #9aa4b5;
}

.note-input {
  margin-bottom: 12px;
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

@media (max-width: 860px) {
  .task-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  h1 {
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
}
</style>
