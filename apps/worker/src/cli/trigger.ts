// `pnpm job:trigger -- <tên job> '<payload JSON>'` — kích hoạt một job ngay (dev/staging, roadmap 024).
// Ví dụ: pnpm job:trigger -- notify:digest '{"workspaceId":"…","week":"2026-10-26"}'
//        pnpm job:trigger -- maintenance:report_tick '{"tick":"manual"}'
// Payload được validate bằng schema của job (packages/jobs). Không chạy ở production (CLAUDE.md quy tắc 9).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { JOBS, parsePayload, type JobName } from '@adxlens/jobs';
import { bullEnqueue, createQueues, redisConnection } from '../queues';

const envFile = path.resolve(import.meta.dirname, '../../../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  if (process.env.APP_ENV === 'production') throw new Error('Không kích hoạt job thủ công ở production.');
  const [name, raw] = process.argv.slice(2).filter((a) => a !== '--');
  if (!name || !(name in JOBS)) {
    console.error(`Job không hợp lệ. Có: ${Object.keys(JOBS).join(', ')}`);
    process.exit(1);
  }
  // Validate bằng schema của job trước khi enqueue (sai → lỗi zod, không enqueue).
  const payload = parsePayload(name as JobName, JSON.parse(raw ?? '{}'));
  const connection = redisConnection(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
  const queues = createQueues(connection);
  await bullEnqueue(queues)(name as JobName, payload);
  console.log(`Đã enqueue ${name}`);
  await Promise.all(Object.values(queues).map((q) => q.close()));
  await connection.quit();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
