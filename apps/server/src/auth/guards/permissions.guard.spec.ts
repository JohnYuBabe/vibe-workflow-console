import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '@vibe/shared';
import { PermissionsGuard } from './permissions.guard';

const user: AuthUser = {
  id: 'user-1',
  email: 'viewer@example.com',
  name: '访客',
  roles: ['viewer'],
  permissions: ['project:read', 'task:read'],
};

function createContext(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('允许拥有所需权限的用户访问', () => {
    reflector.getAllAndOverride.mockReturnValue(['project:read']);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('缺少权限时抛出 ForbiddenException', () => {
    reflector.getAllAndOverride.mockReturnValue(['project:write']);

    expect(() => guard.canActivate(createContext())).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(createContext())).toThrow(
      '没有权限执行该操作',
    );
  });
});
