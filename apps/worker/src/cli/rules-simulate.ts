// `pnpm rules:simulate -- <rule_id> [--days 14]` — CHỈ LOCAL (ADR-0012 mục 4): giả lập N ngày chạy thử
// cho một rule để thử luồng bật chạy thật trên máy dev. Từ chối mọi môi trường khác local.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { simulateShadowDays } from '@adxlens/core/execution';
import { createDb, schema } from '@adxlens/db';

const envFile = path.resolve(import.meta.dirname, '../../../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  if ((process.env.APP_ENV ?? 'local') !== 'local') throw new Error('Chỉ chạy ở local.');
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const ruleId = args[0];
  const i = args.indexOf('--days');
  const days = i >= 0 ? Number(args[i + 1]) : 14;
  if (!ruleId || !/^[0-9a-f-]{36}$/.test(ruleId)) throw new Error('Cần <rule_id>.');
  if (!Number.isInteger(days) || days < 1 || days > 60) throw new Error('--days từ 1 tới 60.');
  if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL');
  const { db, close } = createDb(process.env.DATABASE_URL);
  try {
    const [rule] = await db
      .select({ workspaceId: schema.automationRules.workspaceId })
      .from(schema.automationRules)
      .where(eq(schema.automationRules.id, ruleId));
    if (!rule) throw new Error('Không tìm thấy rule.');
    const r = await simulateShadowDays({ db, workspaceId: rule.workspaceId }, ruleId, days);
    console.log(`Đã giả lập ${days} ngày chạy thử (${r.recorded} lần đánh giá mới).`);
  } finally {
    await close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'lỗi');
  process.exit(1);
});
