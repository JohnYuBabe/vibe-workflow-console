import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from '@vibe/shared';
import { hash } from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const authUser: AuthUser = {
  id: 'user-1',
  email: 'admin@example.com',
  name: '管理员',
  roles: ['admin'],
  permissions: ['project:read', 'project:write'],
};

describe('AuthService', () => {
  let users: {
    findByEmail: jest.Mock;
    toAuthUser: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      toAuthUser: jest.fn().mockReturnValue(authUser),
    };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
    };
    service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
    );
  });

  it('returns null when the email is unknown', async () => {
    users.findByEmail.mockResolvedValue(null);

    await expect(
      service.validateUser('missing@example.com', 'whatever'),
    ).resolves.toBeNull();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('returns null when the password does not match', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      name: '管理员',
      passwordHash: await hash('correct-password', 4),
    });

    await expect(
      service.validateUser('admin@example.com', 'wrong-password'),
    ).resolves.toBeNull();
  });

  it('returns the auth user when the password matches', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      name: '管理员',
      passwordHash: await hash('correct-password', 4),
    });

    await expect(
      service.validateUser('admin@example.com', 'correct-password'),
    ).resolves.toEqual(authUser);
  });

  it('throws a generic error for a bad login', async () => {
    jest.spyOn(service, 'validateUser').mockResolvedValue(null);

    await expect(
      service.login({
        email: 'admin@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns a token and the user for a valid login', async () => {
    jest.spyOn(service, 'validateUser').mockResolvedValue(authUser);

    await expect(
      service.login({
        email: 'admin@example.com',
        password: 'correct-password',
      }),
    ).resolves.toEqual({
      accessToken: 'signed-token',
      user: authUser,
    });

    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'admin@example.com',
    });
  });
});
