// `pnpm seed:staff -- --email pm@adxlens.local --password "..." [--can-enable-flags]`
// Tạo (hoặc cập nhật) tài khoản staff ở môi trường local/staging. Không chạy ở production.
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createDb, schema } from '@adxlens/db';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (process.env.APP_ENV === 'production') {
  console.error('Không chạy seed staff ở production (CLAUDE.md quy tắc 9).');
  process.exit(1);
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const email = arg('email')?.toLowerCase();
const password = arg('password');
const canEnableFlags = process.argv.includes('--can-enable-flags');
if (!email || !password || password.length < 10) {
  console.error('Cần --email và --password (≥ 10 ký tự).');
  process.exit(1);
}

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error('Thiếu SUPABASE_SERVICE_ROLE_KEY (chạy pnpm env:init --force).');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

let userId: string | undefined;
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.data.user) userId = created.data.user.id;
else {
  const list = await admin.auth.admin.listUsers({ perPage: 1000 });
  userId = list.data.users.find((u) => u.email === email)?.id;
}
if (!userId) {
  console.error('Không tạo hoặc tìm được user.');
  process.exit(1);
}

const { db, close } = createDb(process.env.DATABASE_URL!);
await db.insert(schema.users).values({ id: userId, email }).onConflictDoNothing();
await db
  .insert(schema.staff)
  .values({ userId, canEnableFlags })
  .onConflictDoUpdate({ target: schema.staff.userId, set: { canEnableFlags } });
await close();
console.log(`Staff ${email} (can_enable_flags=${canEnableFlags}) đã sẵn sàng.`);
