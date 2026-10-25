// `pnpm seed:staff -- --email pm@adxlens.local --password "..." [--can-enable-flags]` (có cờ = superadmin)
// Mật khẩu có thể truyền qua biến SEED_STAFF_PASSWORD thay cho --password (không lộ trên dòng lệnh).
// `--lock`: đặt mật khẩu ngẫu nhiên không ai biết và bỏ quyền staff (khóa tài khoản PM mặc định khi mở dev ra ngoài).
// Tạo (hoặc cập nhật, kể cả mật khẩu) tài khoản staff ở môi trường local/staging. Không chạy ở production.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
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
const lock = process.argv.includes('--lock');
const password = lock ? randomBytes(24).toString('base64url') : (arg('password') ?? process.env.SEED_STAFF_PASSWORD);
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
const list = await admin.auth.admin.listUsers({ perPage: 1000 });
userId = list.data.users.find((u) => u.email === email)?.id;
if (lock && !userId) {
  console.log(`Không có tài khoản ${email} — không cần khóa.`);
  process.exit(0);
}
if (userId) {
  // Đã có: cập nhật mật khẩu (đổi PM_PASSWORD rồi chạy lại là đổi được mật khẩu).
  const { error } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (error) {
    console.error(`Không cập nhật được mật khẩu: ${error.message}`);
    process.exit(1);
  }
} else {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  userId = created.data.user?.id;
}
if (!userId) {
  console.error('Không tạo hoặc tìm được user.');
  process.exit(1);
}

const { db, close } = createDb(process.env.DATABASE_URL!);
if (lock) {
  await db.delete(schema.staff).where(eq(schema.staff.userId, userId));
  await close();
  console.log(`Đã khóa ${email} (mật khẩu ngẫu nhiên, bỏ quyền staff).`);
  process.exit(0);
}
await db.insert(schema.users).values({ id: userId, email }).onConflictDoNothing();
// ADR-0013: --can-enable-flags = superadmin, không có = operator.
const role = canEnableFlags ? 'superadmin' : 'operator';
await db
  .insert(schema.staff)
  .values({ userId, role, canEnableFlags })
  .onConflictDoUpdate({ target: schema.staff.userId, set: { role, canEnableFlags } });
await close();
console.log(`Staff ${email} (${role}) đã sẵn sàng.`);
