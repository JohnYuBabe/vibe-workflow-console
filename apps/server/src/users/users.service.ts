import { Injectable } from '@nestjs/common';
import type { AuthUser, PermissionString } from '@vibe/shared';
import { PrismaService } from '../prisma/prisma.service';

const userInclude = {
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} as const;

type UserWithRoles = {
  id: string;
  email: string;
  name: string;
  roles: Array<{
    role: {
      name: string;
      permissions: Array<{
        permission: {
          resource: string;
          action: string;
        };
      }>;
    };
  }>;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: userInclude,
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
  }

  toAuthUser(user: UserWithRoles): AuthUser {
    const roles = user.roles.map((userRole) => userRole.role.name).sort();

    const permissions = Array.from(
      new Set(
        user.roles.flatMap((userRole) =>
          userRole.role.permissions.map(
            (rolePermission) =>
              `${rolePermission.permission.resource}:${rolePermission.permission.action}`,
          ),
        ),
      ),
    ).sort() as PermissionString[];

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles,
      permissions,
    };
  }
}
