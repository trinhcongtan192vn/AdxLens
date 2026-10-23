import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { createDb, type Db, type DbHandle } from './client';
import { runMigrations } from './migrate';
import * as s from './schema';

const TEST_DB_NAME = 'adxlens_test';

/** URL database test: TEST_DATABASE_URL, hoặc database `adxlens_test` trên cùng server với DATABASE_URL. */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
  const u = new URL(base);
  u.pathname = `/${TEST_DB_NAME}`;
  return u.toString();
}

/**
 * Stub tối thiểu của Supabase trong database test: `auth.jwt()` đọc claim từ setting
 * `request.jwt.claims` (giống Supabase) và role `authenticated` để policy RLS tạo được.
 */
const AUTH_STUB = `
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
`;

/** Tạo lại database test sạch và chạy toàn bộ migration. Gọi một lần trong globalSetup. */
export async function prepareTestDatabase(): Promise<string> {
  const url = testDatabaseUrl();
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const adminSql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    await adminSql.unsafe(`drop database if exists "${dbName}" with (force)`);
    await adminSql.unsafe(`create database "${dbName}"`);
  } finally {
    await adminSql.end({ timeout: 5 });
  }

  const testSql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await testSql.unsafe(AUTH_STUB);
  } finally {
    await testSql.end({ timeout: 5 });
  }
  await runMigrations(url);
  return url;
}

let shared: DbHandle | undefined;

/** Kết nối tới database test (một kết nối dùng chung trong mỗi file test). */
export function testDb(): Db {
  shared ??= createDb(testDatabaseUrl(), { max: 4 });
  return shared.db;
}

export async function closeTestDb(): Promise<void> {
  await shared?.close();
  shared = undefined;
}

// ---------- Factory dữ liệu test ----------

export async function seedUser(db: Db, email = `u-${randomUUID().slice(0, 8)}@test.local`) {
  const [u] = await db.insert(s.users).values({ id: randomUUID(), email }).returning();
  return u!;
}

/** Tạo workspace với owner, trả cả hai. */
export async function seedWorkspace(db: Db, name = `WS ${randomUUID().slice(0, 6)}`) {
  const owner = await seedUser(db);
  const [ws] = await db.insert(s.workspaces).values({ name }).returning();
  await db.insert(s.memberships).values({ workspaceId: ws!.id, userId: owner.id, role: 'owner' });
  return { workspace: ws!, owner };
}

export async function seedMember(db: Db, workspaceId: string, role: s.Role, clientAccess: string[] = []) {
  const u = await seedUser(db);
  await db.insert(s.memberships).values({ workspaceId, userId: u.id, role, clientAccess });
  return u;
}

export async function seedStaff(db: Db, canEnableFlags: boolean) {
  const u = await seedUser(db);
  await db.insert(s.staff).values({ userId: u.id, canEnableFlags });
  return u;
}

/** Kết nối Meta giả (ciphertext rác — đủ để test quan hệ dữ liệu, không giải mã được). */
export async function seedConnection(db: Db, workspaceId: string, createdBy: string, metaUserId = 'meta-u') {
  const [c] = await db
    .insert(s.metaConnections)
    .values({
      workspaceId,
      createdBy,
      metaUserId,
      metaUserName: `Meta ${metaUserId}`,
      tokenCiphertext: Buffer.from('not-a-real-token-ciphertext-000000000000'),
      tokenKeyVersion: 1,
      scopes: ['ads_read'],
    })
    .returning();
  return c!;
}

export async function seedAdAccount(
  db: Db,
  workspaceId: string,
  connectionId: string,
  opts: {
    metaAccountId?: string;
    name?: string;
    clientId?: string | null;
    confirmed?: boolean;
    currency?: string;
  } = {},
) {
  const [a] = await db
    .insert(s.adAccounts)
    .values({
      workspaceId,
      connectionId,
      metaAccountId: opts.metaAccountId ?? `act_${Math.floor(Math.random() * 1e9)}`,
      name: opts.name ?? 'Tài khoản QC',
      currency: opts.currency ?? 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      clientId: opts.clientId ?? null,
      assignmentStatus: opts.confirmed ? 'confirmed' : 'suggested',
    })
    .returning();
  return a!;
}

export async function seedClient(db: Db, workspaceId: string, name = 'Client A') {
  const [c] = await db.insert(s.clients).values({ workspaceId, name }).returning();
  return c!;
}

/** Xóa dữ liệu mọi bảng nghiệp vụ, giữ schema. Dùng trong beforeEach của test tích hợp. */
export async function truncateAll(db: Db): Promise<void> {
  const rows = await db.execute<{ fq: string }>(sql`
    select format('%I.%I', schemaname, tablename) as fq
    from pg_tables
    where schemaname in ('app', 'analytics') and tablename not like '__drizzle%'
  `);
  const names = rows.map((r) => r.fq);
  if (names.length) await db.execute(sql.raw(`truncate ${names.join(', ')} restart identity cascade`));
}
