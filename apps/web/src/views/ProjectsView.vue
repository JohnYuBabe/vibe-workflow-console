<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '@vibe/shared';
import {
  createProject,
  fetchProjects,
  statusCountsOf,
  taskCountOf,
  type Project,
} from '@/api/projects';
import { readApiError } from '@/utils/api-error';
import { formatDateTime } from '@/utils/format';
import { statusTagType } from '@/utils/task-status';

const projects = ref<Project[]>([]);
const loading = ref(true);
const loadError = ref('');

const dialogVisible = ref(false);
const submitting = ref(false);
const form = reactive({
  name: '',
  description: '',
  repoUrl: '',
});

const totalTasks = computed(() =>
  projects.value.reduce((sum, project) => sum + taskCountOf(project), 0),
);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    projects.value = await fetchProjects();
  } catch (error: unknown) {
    loadError.value = readApiError(error, '加载项目失败，请稍后重试。');
  } finally {
    loading.value = false;
  }
}

function openDialog(): void {
  form.name = '';
  form.description = '';
  form.repoUrl = '';
  dialogVisible.value = true;
}

async function submitProject(): Promise<void> {
  if (submitting.value) return;

  const name = form.name.trim();
  if (!name) {
    ElMessage.warning('请输入项目名称');
    return;
  }

  submitting.value = true;
  try {
    await createProject({
      name,
      description: form.description.trim() || null,
      repoUrl: form.repoUrl.trim() || null,
    });
    ElMessage.success('项目已创建');
    dialogVisible.value = false;
    await load();
  } catch (error: unknown) {
    ElMessage.error(readApiError(error, '创建项目失败，请稍后重试。'));
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="projects">
    <header class="page-head">
      <div>
        <p class="eyebrow">Projects · 项目</p>
        <h1>项目</h1>
        <p class="sub">
          每个项目下的任务都要经过规格、验证、追溯三道门禁。
          当前共 {{ projects.length }} 个项目、{{ totalTasks }} 个任务。
        </p>
      </div>

      <el-button
        v-permission="'project:write'"
        type="primary"
        class="create-btn"
        @click="openDialog"
      >
        新建项目
      </el-button>
    </header>

    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      :closable="false"
      show-icon
    />

    <div v-if="loading" class="state">正在加载项目…</div>

    <el-empty
      v-else-if="!projects.length && !loadError"
      description="还没有项目，先创建一个吧"
    />

    <section v-else class="project-grid">
      <router-link
        v-for="project in projects"
        :key="project.id"
        :to="`/projects/${project.id}`"
        class="project-card"
      >
        <div class="card-top">
          <h2>{{ project.name }}</h2>
          <span class="arrow" aria-hidden="true">→</span>
        </div>

        <p class="description">
          {{ project.description || '暂无项目描述' }}
        </p>

        <div class="counts">
          <span class="task-total">{{ taskCountOf(project) }} 个任务</span>
          <div class="status-tags">
            <el-tag
              v-for="status in TASK_STATUSES"
              :key="status"
              size="small"
              effect="plain"
              :type="statusTagType(status)"
              :class="{ zero: !statusCountsOf(project)[status] }"
            >
              {{ TASK_STATUS_LABELS[status] }}
              {{ statusCountsOf(project)[status] }}
            </el-tag>
          </div>
        </div>

        <div class="card-foot">
          <span v-if="project.repoUrl" class="repo">{{ project.repoUrl }}</span>
          <span v-else class="repo muted">未关联仓库</span>
          <span class="updated">创建于 {{ formatDateTime(project.createdAt) }}</span>
        </div>
      </router-link>
    </section>

    <el-dialog
      v-model="dialogVisible"
      title="新建项目"
      width="min(480px, 92vw)"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" @submit.prevent="submitProject">
        <el-form-item label="项目名称" required>
          <el-input
            v-model="form.name"
            placeholder="例如：vibe-workflow-console"
            maxlength="80"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="项目描述">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="一句话说明这个项目要交付什么"
          />
        </el-form-item>

        <el-form-item label="仓库地址">
          <el-input
            v-model="form.repoUrl"
            placeholder="https://github.com/owner/repo"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitProject">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.projects {
  display: grid;
  gap: 20px;
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

.create-btn {
  flex: none;
  margin-top: 4px;
}

.state {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: #8a95a7;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.project-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
  border: 1px solid #e1e6ef;
  border-radius: 14px;
  background: #fff;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease,
    transform 0.15s ease;
}

.project-card:hover {
  border-color: #b9c9e4;
  box-shadow: 0 10px 28px rgba(31, 58, 95, 0.08);
  transform: translateY(-1px);
}

.card-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.card-top h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #1f3a5f;
}

.arrow {
  flex: none;
  font-size: 14px;
  color: #9aa4b5;
}

.description {
  margin: 0;
  min-height: 42px;
  font-size: 12.5px;
  line-height: 1.7;
  color: #6b7789;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.counts {
  display: grid;
  gap: 8px;
  padding: 12px 0;
  border-top: 1px dashed #edf0f5;
  border-bottom: 1px dashed #edf0f5;
}

.task-total {
  font-size: 12px;
  font-weight: 600;
  color: #3d4a5e;
}

.status-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.status-tags :deep(.el-tag) {
  font-variant-numeric: tabular-nums;
}

.status-tags :deep(.el-tag.zero) {
  opacity: 0.45;
}

.card-foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 11.5px;
}

.repo {
  min-width: 0;
  color: #4c586c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repo.muted {
  color: #9aa4b5;
}

.updated {
  flex: none;
  color: #9aa4b5;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 860px) {
  .page-head {
    flex-direction: column;
  }

  h1 {
    font-size: 26px;
  }

  .create-btn {
    margin-top: 0;
  }

  .project-grid {
    grid-template-columns: 1fr;
  }

  .card-foot {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>
