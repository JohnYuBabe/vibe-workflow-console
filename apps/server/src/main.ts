import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

const WEAK_SECRET = /change-me|dev-secret|example|test-secret|secret/i;

async function bootstrap(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  const jwtSecret = process.env.JWT_SECRET ?? '';

  if (isProduction) {
    if (jwtSecret.length < 32 || WEAK_SECRET.test(jwtSecret)) {
      throw new Error(
        '生产环境必须设置长度至少 32 位、且不含占位词的 JWT_SECRET（openssl rand -base64 48）',
      );
    }
    if (!process.env.DATABASE_URL) {
      throw new Error('生产环境必须设置 DATABASE_URL');
    }
  }

  const app = await NestFactory.create(AppModule);

  // 同源部署不需要 CORS；只有显式配置 CORS_ORIGINS 时才放行
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({ origin: origins, credentials: true });
  }

  // CSP 由 nginx 统一设置；这里补齐其余安全响应头
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  const http = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: unknown) => void;
    disable: (key: string) => void;
  };
  http.disable('x-powered-by');
  // 只信任一层反向代理，保证限流看到的是真实客户端 IP
  http.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[server] listening on http://localhost:${port}/api`);
}

void bootstrap();
