<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const initials = computed(() => auth.user?.name?.slice(0, 1) ?? '?');

function logout(): void {
  auth.logout();
  void router.push({ name: 'login' });
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <router-link to="/" class="wordmark">
        vibe<span>/</span>console
      </router-link>

      <nav class="app-nav">
        <router-link to="/" class="nav-link">控制台</router-link>
      </nav>

      <div v-if="auth.user" class="account">
        <div class="avatar">{{ initials }}</div>
        <div class="account-meta">
          <strong>{{ auth.user.name }}</strong>
          <span>{{ auth.user.email }}</span>
        </div>
        <div class="role-tags">
          <el-tag
            v-for="role in auth.user.roles"
            :key="role"
            size="small"
            effect="plain"
          >
            {{ role }}
          </el-tag>
        </div>
        <el-button text class="logout" @click="logout">退出</el-button>
      </div>
    </header>

    <main class="app-main">
      <router-view />
    </main>

    <footer class="app-footer">
      <span>vibe-workflow-console</span>
      <span class="dot">·</span>
      <span>Day 1 · 登录与权限</span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f4f6fa;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 28px;
  height: 64px;
  padding: 0 28px;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid #e1e6ef;
  backdrop-filter: blur(10px);
}

.wordmark {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #1f3a5f;
  text-decoration: none;
  white-space: nowrap;
}

.wordmark span {
  color: #2f6fed;
  padding: 0 2px;
}

.app-nav {
  display: flex;
  gap: 6px;
}

.nav-link {
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: #4c586c;
  text-decoration: none;
}

.nav-link.router-link-active {
  color: #1f3a5f;
  background: #eef3fb;
  font-weight: 600;
}

.account {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  min-width: 0;
}

.avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #1f3a5f;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  flex: none;
}

.account-meta {
  display: grid;
  min-width: 0;
  line-height: 1.3;
}

.account-meta strong {
  font-size: 13px;
  font-weight: 600;
  color: #18202f;
}

.account-meta span {
  font-size: 11.5px;
  color: #8a95a7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-tags {
  display: flex;
  gap: 4px;
}

.logout {
  font-size: 13px;
  color: #6b7789;
}

.app-main {
  flex: 1;
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 32px 28px 48px;
}

.app-footer {
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 18px;
  font-size: 12px;
  color: #9aa4b5;
  border-top: 1px solid #e8ecf3;
}

.dot {
  color: #c3cad6;
}

@media (max-width: 720px) {
  .app-header {
    gap: 12px;
    padding: 0 16px;
  }

  .app-nav {
    display: none;
  }

  .account-meta,
  .role-tags {
    display: none;
  }

  .app-main {
    padding: 22px 16px 36px;
  }
}
</style>
