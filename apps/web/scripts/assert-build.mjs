#!/usr/bin/env node
// 构建后自检：子路径、API 前缀、演示口令泄漏。
// 这些错误在浏览器里表现为白屏或 404，放在构建阶段直接失败更省事。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const base = process.env.VITE_BASE || '/';
const apiBase = process.env.VITE_API_BASE || '/api';

const failures = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assetPrefix = `${base.replace(/\/$/, '')}/assets/`;

if (!html.includes(assetPrefix)) {
  failures.push(`index.html 没有引用 ${assetPrefix}（检查 VITE_BASE）`);
}

const scripts = walk(join(dist, 'assets')).filter((file) => file.endsWith('.js'));
const code = scripts.map((file) => readFileSync(file, 'utf8')).join('\n');

if (!code.includes(apiBase)) {
  failures.push(`bundle 中找不到 VITE_API_BASE=${apiBase}`);
}

// 生产包不允许出现种子账号口令
for (const secret of ['admin123', 'editor123', 'viewer123', 'dev-secret-change-me']) {
  if (code.includes(secret)) {
    failures.push(`bundle 中仍然包含本地演示口令：${secret}`);
  }
}

if (failures.length > 0) {
  console.error('[assert-build] 构建产物检查失败：');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`[assert-build] ok · base=${base} · api=${apiBase} · ${scripts.length} 个 js 文件`);
