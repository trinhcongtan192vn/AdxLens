import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Db } from '@adxlens/db';

/** Băm toàn bộ dữ liệu của một workspace trong mọi bảng có cột workspace_id (và chính hàng workspace). */
export async function workspaceFingerprint(db: Db, workspaceId: string): Promise<string> {
  const tables = await db.execute<{ fq: string }>(sql`
    select format('%I.%I', table_schema, table_name) as fq
    from information_schema.columns
    where table_schema in ('app','analytics') and column_name = 'workspace_id'
    order by 1
  `);
  const h = createHash('sha256');
  const ws = await db.execute(sql`select * from app.workspaces where id = ${workspaceId}`);
  h.update(JSON.stringify(ws));
  for (const t of tables) {
    const rows = await db.execute(sql.raw(`select * from ${t.fq} where workspace_id = '${workspaceId}' order by 1`));
    h.update(t.fq + JSON.stringify(rows));
  }
  return h.digest('hex');
}
