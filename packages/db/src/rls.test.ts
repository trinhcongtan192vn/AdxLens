import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from './client';
import { closeTestDb, seedWorkspace, testDb, truncateAll } from './testing';

const db = testDb();

beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

class Rollback extends Error {}

/** Chạy truy vấn dưới role `authenticated` với claim cho trước, rồi rollback mọi thay đổi. */
async function asAuthenticated<T>(
  claims: Record<string, string>,
  fn: (tx: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  let out: T | undefined;
  await db
    .transaction(async (tx) => {
      // Cấp quyền tạm để kiểm tra policy; production không cấp quyền trực tiếp cho authenticated.
      await tx.execute(sql`grant usage on schema app to authenticated`);
      await tx.execute(sql`grant select on all tables in schema app to authenticated`);
      await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
      await tx.execute(sql`set local role authenticated`);
      out = await fn(tx);
      throw new Rollback();
    })
    .catch((e: unknown) => {
      if (!(e instanceof Rollback)) throw e;
    });
  return out as T;
}

describe('RLS', () => {
  it('mọi bảng trong schema app và analytics đều bật RLS', async () => {
    const rows = await db.execute<{ tbl: string; rls: boolean }>(sql`
      select format('%I.%I', n.nspname, c.relname) as tbl, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('app', 'analytics') and c.relkind in ('r', 'p')
    `);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.rls).map((r) => r.tbl)).toEqual([]);
  });

  it('role authenticated chỉ thấy dữ liệu của workspace trong JWT', async () => {
    const a = await seedWorkspace(db, 'A');
    await seedWorkspace(db, 'B');
    const seen = await asAuthenticated({ workspace_id: a.workspace.id }, async (tx) => ({
      ws: await tx.execute<{ id: string }>(sql`select id from app.workspaces`),
      ms: await tx.execute<{ workspace_id: string }>(sql`select workspace_id from app.memberships`),
    }));
    expect(seen.ws.map((r) => r.id)).toEqual([a.workspace.id]);
    expect(seen.ms.map((r) => r.workspace_id)).toEqual([a.workspace.id]);
  });

  it('không có claim workspace thì không thấy gì', async () => {
    await seedWorkspace(db, 'A');
    const seen = await asAuthenticated({}, (tx) => tx.execute<{ id: string }>(sql`select id from app.workspaces`));
    expect(seen).toHaveLength(0);
  });

  it('bảng staff không đọc được qua role authenticated', async () => {
    const seen = await asAuthenticated({ sub: '00000000-0000-0000-0000-000000000000' }, (tx) =>
      tx.execute(sql`select * from app.staff`),
    );
    expect(seen).toHaveLength(0);
  });
});
