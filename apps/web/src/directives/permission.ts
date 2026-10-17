import type { Directive, DirectiveBinding } from 'vue';
import type { PermissionString } from '@vibe/shared';
import { useAuthStore } from '@/stores/auth';

type PermissionValue = PermissionString | PermissionString[];

function isAllowed(value: PermissionValue): boolean {
  const auth = useAuthStore();
  const required = Array.isArray(value) ? value : [value];
  return required.some((permission) => auth.hasPermission(permission));
}

function apply(el: HTMLElement, binding: DirectiveBinding<PermissionValue>): void {
  // 没写权限值时保持元素原样，避免误删
  if (!binding.value) {
    return;
  }

  if (!isAllowed(binding.value)) {
    el.parentNode?.removeChild(el);
  }
}

/**
 * v-permission="'project:write'"
 * 没有权限时直接把元素从 DOM 移除，viewer 看不到任何写操作按钮。
 */
export const permissionDirective: Directive<HTMLElement, PermissionValue> = {
  mounted: apply,
  updated: apply,
};
