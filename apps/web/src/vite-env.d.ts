/// <reference types="vite/client" />

import type { permissionDirective } from '@/directives/permission';

declare module 'vue' {
  interface GlobalDirectives {
    vPermission: typeof permissionDirective;
  }
}

export {};
