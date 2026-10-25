// `pnpm purge:test-data` (chạy thử, chỉ in số dòng) · `pnpm purge:test-data -- --apply` (xóa thật).
// Dọn dữ liệu do test / E2E / Meta mock tạo trong DB LOCAL (bản dev + bản team dùng chung): xóa workspace không có kết
// nối Meta thật kèm mọi dữ liệu có `workspace_id`, gỡ kết nối mock trong workspace thật, xóa user test (app + auth).
// Không chạy với DB ngoài máy (staging / production) — CLAUDE.md quy tắc 9.
import { existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { createDb } from '@adxlens/db';
import { isLocalDatabase, planPurge } from './lib/purge-test-data.mjs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.DATABASE_URL;
if (process.env.APP_ENV === 'production' || !url || !isLocalDatabase(url)) {
  console.error('Chỉ chạy với DATABASE_URL trên máy (127.0.0.1 / localhost).');
  process.exit(1);
}
const apply = process.argv.includes('--apply');
const { db, close } = createDb(url, { max: 1 });
const rows = <T,>(q: ReturnType<typeof sql>) => db.execute(q) as unknown as Promise<T[]>;

const workspaces = await rows<{
  id: string;
  name: string;
  connections: { id: string; metaUserId: string; isDemo: boolean }[];
}>(sql`
  select w.id, w.name, coalesce((select json_agg(json_build_object('id', c.id, 'metaUserId', c.meta_user_id,
    'isDemo', c.is_demo)) from app.meta_connections c where c.workspace_id = w.id), '[]') as connections
  from app.workspaces w`);
const users = await rows<{ id: string; email: string; workspaceIds: string[] }>(sql`
  select u.id, u.email, coalesce(array_agg(m.workspace_id) filter (where m.workspace_id is not null), '{}') as "workspaceIds"
  from app.users u left join app.memberships m on m.user_id = u.id
  where not exists (select 1 from app.staff s where s.user_id = u.id and u.email not similar to '%@(e2e|test).local')
  group by u.id, u.email`);
const plan = planPurge(workspaces, users);

// Mọi bảng nghiệp vụ có workspace_id (đọc từ DB để không sót bảng mới).
const wsTables = (
  await rows<{ t: string }>(sql`
    select format('%I.%I', c.table_schema, c.table_name) as t from information_schema.columns c
    join information_schema.tables tb using (table_schema, table_name)
    where tb.table_type = 'BASE TABLE' and c.column_name = 'workspace_id' and c.table_schema in ('app', 'analytics')`)
).map((r) => r.t);
const accTables = (
  await rows<{ t: string }>(sql`
    select format('%I.%I', c.table_schema, c.table_name) as t from information_schema.columns c
    join information_schema.tables tb using (table_schema, table_name)
    where tb.table_type = 'BASE TABLE' and c.column_name = 'ad_account_id' and c.table_schema in ('app', 'analytics')`)
).map((r) => r.t);
const userTables = [
  'app.staff',
  'app.memberships',
  'app.notifications',
  'app.notification_settings',
  'app.oauth_grants',
];

const ids = (a: string[]) => sql.raw(`array[${a.map((x) => `'${x.replace(/[^0-9a-f-]/gi, '')}'`).join(',')}]::uuid[]`);
const mockConnIds = plan.mockConnections.map((c) => c.connectionId);
const mockAccIds = mockConnIds.length
  ? (
      await rows<{ id: string }>(sql`select id from app.ad_accounts where connection_id = any(${ids(mockConnIds)})`)
    ).map((r) => r.id)
  : [];

console.log(`Giữ ${plan.keepWorkspaces.length} workspace: ${plan.keepWorkspaces.join(', ')}`);
console.log(`Xóa ${plan.removeWorkspaceIds.length} workspace, ${plan.removeUserIds.length} user test.`);
console.log(`Gỡ ${mockConnIds.length} kết nối mock trong workspace được giữ (${mockAccIds.length} tài khoản QC).`);
// Đăng ký test chưa vào app (chỉ có ở Supabase Auth).
const authOnly = await rows<{ id: string }>(sql`
  select a.id from auth.users a
  where a.email ~* '@(e2e|test)\\.local$' and not exists (select 1 from app.users u where u.id = a.id)`);
console.log(`Xóa ${authOnly.length} tài khoản đăng nhập test chưa vào app.`);
if (!apply) {
  console.log('Chạy thử: chưa xóa gì. Thêm --apply để xóa thật.');
  await close();
  process.exit(0);
}

await db.transaction(async (tx) => {
  // Dữ liệu test local: tắt khóa ngoại + trigger chỉ-thêm (nhật ký) trong giao dịch này để xóa trọn.
  await tx.execute(sql`set local session_replication_role = replica`);
  if (plan.removeWorkspaceIds.length) {
    for (const t of wsTables) {
      await tx.execute(sql`delete from ${sql.raw(t)} where workspace_id = any(${ids(plan.removeWorkspaceIds)})`);
    }
    await tx.execute(sql`delete from app.workspaces where id = any(${ids(plan.removeWorkspaceIds)})`);
  }
  if (mockAccIds.length) {
    for (const t of accTables) {
      if (t !== 'app.ad_accounts')
        await tx.execute(sql`delete from ${sql.raw(t)} where ad_account_id = any(${ids(mockAccIds)})`);
    }
    await tx.execute(sql`delete from app.ad_accounts where id = any(${ids(mockAccIds)})`);
  }
  if (mockConnIds.length) {
    await tx.execute(sql`delete from app.meta_available_accounts where connection_id = any(${ids(mockConnIds)})`);
    await tx.execute(sql`delete from app.meta_connections where id = any(${ids(mockConnIds)})`);
  }
  if (plan.removeUserIds.length) {
    for (const t of userTables) {
      await tx.execute(sql`delete from ${sql.raw(t)} where user_id = any(${ids(plan.removeUserIds)})`);
    }
    await tx.execute(sql`delete from app.users where id = any(${ids(plan.removeUserIds)})`);
  }
});
// Tài khoản đăng nhập (Supabase Auth): xóa bình thường để cascade dọn phiên, identity.
const authIds = [...plan.removeUserIds, ...authOnly.map((r) => r.id)];
if (authIds.length) await db.execute(sql`delete from auth.users where id = any(${ids(authIds)})`);
console.log('Đã xóa xong.');
await close();
