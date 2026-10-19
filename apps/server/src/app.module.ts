import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { DecisionsModule } from './decisions/decisions.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120),
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    HealthModule,
    ProjectsModule,
    TasksModule,
    DecisionsModule,
    DashboardModule,
  ],
  providers: [
    // 限流最先执行，避免未认证请求消耗 JWT 与数据库查询
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // 顺序有意义：先解析 JWT 得到 request.user，再按权限放行
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
