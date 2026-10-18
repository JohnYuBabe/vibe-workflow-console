import { createRouter, createWebHistory } from 'vue-router';
import { ElMessage } from 'element-plus';
import type { PermissionString } from '@vibe/shared';
import { useAuthStore } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    /** 无需登录即可访问 */
    public?: boolean;
    /** 进入页面前必须拥有的权限 */
    permission?: PermissionString;
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'projects',
          name: 'projects',
          component: () => import('@/views/ProjectsView.vue'),
          meta: { permission: 'project:read' },
        },
        {
          path: 'projects/:id',
          name: 'project-detail',
          component: () => import('@/views/ProjectDetailView.vue'),
          meta: { permission: 'project:read' },
        },
        {
          path: 'board',
          name: 'board',
          component: () => import('@/views/BoardView.vue'),
          meta: { permission: 'task:read' },
        },
        {
          path: 'tasks/:id',
          name: 'task-detail',
          component: () => import('@/views/TaskDetailView.vue'),
          meta: { permission: 'task:read' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const isPublic = Boolean(to.meta.public);

  if (isPublic) {
    if (auth.isAuthenticated && to.name === 'login') {
      return { name: 'dashboard' };
    }
    return true;
  }

  if (!auth.isAuthenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    };
  }

  if (!auth.user) {
    try {
      await auth.fetchMe();
    } catch {
      auth.logout();
      return {
        name: 'login',
        query: { redirect: to.fullPath },
      };
    }
  }

  const required = to.meta.permission;
  if (required && !auth.hasPermission(required)) {
    ElMessage.warning('没有访问该页面的权限');
    return { name: 'dashboard' };
  }

  return true;
});

export default router;
