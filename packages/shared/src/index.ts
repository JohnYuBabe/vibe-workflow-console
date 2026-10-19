export * from './task-policy';

export type PermissionString = `${string}:${string}`;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: PermissionString[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export const PERMISSION_LIST = [
  'project:read',
  'project:write',
  'task:read',
  'task:write',
  'decision:read',
  'decision:write',
  'user:manage',
] as const satisfies readonly PermissionString[];

export type KnownPermission = (typeof PERMISSION_LIST)[number];

export const ROLE_PRESETS = {
  admin: [...PERMISSION_LIST],
  editor: [
    'project:read',
    'project:write',
    'task:read',
    'task:write',
    'decision:read',
    'decision:write',
  ],
  viewer: ['project:read', 'task:read', 'decision:read'],
} as const satisfies Record<string, readonly PermissionString[]>;

export type RoleName = keyof typeof ROLE_PRESETS;
