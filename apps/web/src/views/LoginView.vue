<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import type { FormInstance, FormRules } from 'element-plus';
import { DEMO_ACCOUNTS } from '@vibe/shared';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const formRef = ref<FormInstance>();
const loading = ref(false);
const error = ref('');

const form = reactive({
  email: '',
  password: '',
});

const rules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
};

function fillDemo(email: string, password: string): void {
  form.email = email;
  form.password = password;
  error.value = '';
}

function readError(value: unknown): string {
  if (axios.isAxiosError(value)) {
    const body = value.response?.data as
      | { message?: string | string[] }
      | undefined;

    if (Array.isArray(body?.message)) {
      return body.message.join('；');
    }
    if (typeof body?.message === 'string') {
      return body.message;
    }
    if (value.code === 'ECONNABORTED') {
      return '请求超时，请稍后重试。';
    }
    if (!value.response) {
      return '无法连接服务，请稍后重试。';
    }
  }

  return '登录失败，请稍后重试。';
}

async function submit(): Promise<void> {
  if (!formRef.value) {
    return;
  }

  error.value = '';
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }

  loading.value = true;
  try {
    await auth.login(form.email, form.password);

    const redirect = route.query.redirect;
    const target =
      typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/';
    await router.push(target);
  } catch (value: unknown) {
    error.value = readError(value);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <section class="brand">
      <div class="wordmark">vibe<span>/</span>console</div>

      <div class="brand-copy">
        <p class="eyebrow">AI 辅助交付控制台</p>
        <h1>让 AI 写完，<br />不等于完成。</h1>
        <p class="lede">
          管住交付过程，而不是管住聊天窗口。规格、会话、验证、决策，
          都留在一个能追溯的地方。
        </p>
      </div>

      <ul class="rule-list">
        <li>
          <span class="rule-index">01</span>
          <span>没有规格和验收标准，任务不能进入开发。</span>
        </li>
        <li>
          <span class="rule-index">02</span>
          <span>没有通过的验证，任务不能标记完成。</span>
        </li>
        <li>
          <span class="rule-index">03</span>
          <span>每个完成项必须能追溯到 AI 会话或人工记录。</span>
        </li>
      </ul>

      <p class="brand-foot">
        规格、验证、追溯三道门禁 · 决策记录与交付指标
      </p>
    </section>

    <section class="form-side">
      <el-card class="login-card" shadow="never">
        <div class="card-head">
          <h2>登录</h2>
          <p>使用 demo 账号进入控制台。</p>
        </div>

        <el-alert
          v-if="error"
          :title="error"
          type="error"
          :closable="false"
          show-icon
          class="login-alert"
        />

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          @submit.prevent="submit"
        >
          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model="form.email"
              placeholder="admin@example.com"
              autocomplete="username"
              size="large"
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="至少 6 位"
              autocomplete="current-password"
              show-password
              size="large"
              @keyup.enter="submit"
            />
          </el-form-item>

          <el-button
            type="primary"
            size="large"
            class="submit"
            :loading="loading"
            native-type="submit"
          >
            进入控制台
          </el-button>
        </el-form>

        <div class="demo-block">
          <div class="demo-title">Demo 账号</div>
          <div class="demo-grid">
            <button
              v-for="account in DEMO_ACCOUNTS"
              :key="account.role"
              type="button"
              class="demo-item"
              @click="fillDemo(account.email, account.password)"
            >
              <span class="demo-role">{{ account.role }}</span>
              <span class="demo-email">{{ account.email }}</span>
            </button>
          </div>
          <p class="demo-hint">点击账号自动填入，再点「进入控制台」。</p>
        </div>
      </el-card>

      <p class="side-foot">vibe-workflow-console · 本地演示环境</p>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(380px, 0.95fr);
}

.brand {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 32px;
  padding: 56px 64px;
  color: #eef3fb;
  background:
    radial-gradient(circle at 18% 12%, rgba(75, 124, 210, 0.35), transparent 42%),
    radial-gradient(circle at 82% 88%, rgba(47, 111, 237, 0.22), transparent 48%),
    #14233a;
  overflow: hidden;
}

.brand::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, black, transparent 85%);
  pointer-events: none;
}

.wordmark {
  position: relative;
  z-index: 1;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.wordmark span {
  color: #7fa8ef;
  padding: 0 2px;
}

.brand-copy {
  position: relative;
  z-index: 1;
  max-width: 520px;
}

.eyebrow {
  margin: 0 0 14px;
  font-size: 12px;
  letter-spacing: 0.24em;
  color: #8fb4f2;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(34px, 4.2vw, 58px);
  line-height: 1.16;
  letter-spacing: -0.02em;
}

.lede {
  margin: 22px 0 0;
  max-width: 440px;
  font-size: 15px;
  line-height: 1.9;
  color: #b8c7dd;
}

.rule-list {
  position: relative;
  z-index: 1;
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
  max-width: 560px;
}

.rule-list li {
  display: flex;
  gap: 14px;
  align-items: baseline;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 13.5px;
  line-height: 1.7;
  color: #dbe5f3;
}

.rule-index {
  font-size: 11px;
  letter-spacing: 0.12em;
  color: #7fa8ef;
  font-variant-numeric: tabular-nums;
}

.brand-foot {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 12px;
  color: #7d90aa;
}

.form-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 40px 28px;
  background: #f4f6fa;
}

.login-card {
  width: min(100%, 420px);
  border: 1px solid #e1e6ef;
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(20, 35, 58, 0.08);
}

.card-head {
  margin-bottom: 22px;
}

.card-head h2 {
  margin: 0 0 6px;
  font-size: 24px;
  letter-spacing: -0.01em;
  color: #18202f;
}

.card-head p {
  margin: 0;
  font-size: 13px;
  color: #7c8799;
}

.login-alert {
  margin-bottom: 18px;
}

.submit {
  width: 100%;
  margin-top: 4px;
}

.demo-block {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px dashed #e1e6ef;
}

.demo-title {
  margin-bottom: 10px;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: #7c8799;
  text-transform: uppercase;
}

.demo-grid {
  display: grid;
  gap: 8px;
}

.demo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid #e1e6ef;
  border-radius: 8px;
  background: #fbfcfe;
  color: #4c586c;
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.demo-item:hover {
  border-color: #b9c9e4;
  background: #f4f8ff;
}

.demo-role {
  font-weight: 600;
  color: #1f3a5f;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 11px;
}

.demo-email {
  color: #7c8799;
}

.demo-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: #9aa4b5;
}

.side-foot {
  margin: 0;
  font-size: 12px;
  color: #9aa4b5;
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .brand {
    padding: 36px 26px 30px;
    gap: 22px;
  }

  .brand-copy h1 {
    font-size: 34px;
  }

  .lede {
    margin-top: 14px;
    font-size: 14px;
  }

  .rule-list {
    display: none;
  }

  .brand-foot {
    display: none;
  }

  .form-side {
    padding: 26px 18px 40px;
    justify-content: flex-start;
  }
}
</style>
