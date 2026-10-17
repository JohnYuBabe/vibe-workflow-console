import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { AuthUser, LoginResponse, PermissionString } from '@vibe/shared';
import { fetchMeRequest, loginRequest } from '@/api/auth';
import { TOKEN_KEY } from '@/api/client';

export { TOKEN_KEY };

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY));
  const user = ref<AuthUser | null>(null);

  const isAuthenticated = computed(() => Boolean(token.value));

  function setToken(value: string): void {
    token.value = value;
    localStorage.setItem(TOKEN_KEY, value);
  }

  function clear(): void {
    token.value = null;
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const result: LoginResponse = await loginRequest({ email, password });
    setToken(result.accessToken);
    user.value = result.user;
    return result.user;
  }

  async function fetchMe(): Promise<AuthUser> {
    const me = await fetchMeRequest();
    user.value = me;
    return me;
  }

  /** 当前用户是否拥有某个权限；未登录或未加载用户时一律视为没有 */
  function hasPermission(permission: PermissionString): boolean {
    return user.value?.permissions.includes(permission) ?? false;
  }

  function logout(): void {
    clear();
  }

  return {
    token,
    user,
    isAuthenticated,
    login,
    fetchMe,
    hasPermission,
    logout,
  };
});
