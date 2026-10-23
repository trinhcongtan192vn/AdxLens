import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PostgresJsDatabase<Schema>;
/** Db hoặc transaction đang mở: hàm core nhận kiểu này để chạy được trong cả hai. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export type DbHandle = {
  db: Db;
  close: () => Promise<void>;
};

export function createDb(url: string, opts: { max?: number } = {}): DbHandle {
  const sql = postgres(url, {
    max: opts.max ?? 10,
    // Tắt prepared statement để chạy được qua pooler PgBouncer ở chế độ transaction (L3 4.2).
    prepare: false,
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema });
  return { db, close: () => sql.end({ timeout: 5 }) };
}

/** Kiểm tra kết nối (health check). */
export async function ping(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}

/**
 * Kết nối dùng chung trong một tiến trình (web hoặc worker). Giữ trên `globalThis`: Next.js dev nạp lại
 * module theo từng route/HMR, biến module-level tạo pool mới mỗi lần và làm cạn kết nối Postgres.
 */
const holder = globalThis as unknown as { __adxlensDb?: DbHandle };

export function getDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error('DATABASE_URL chưa cấu hình');
  holder.__adxlensDb ??= createDb(url);
  return holder.__adxlensDb.db;
}

export async function closeDb(): Promise<void> {
  await holder.__adxlensDb?.close();
  holder.__adxlensDb = undefined;
}
