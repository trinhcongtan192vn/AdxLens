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

let singleton: DbHandle | undefined;

/** Kết nối dùng chung trong một tiến trình (web hoặc worker). */
export function getDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error('DATABASE_URL chưa cấu hình');
  singleton ??= createDb(url);
  return singleton.db;
}

export async function closeDb(): Promise<void> {
  await singleton?.close();
  singleton = undefined;
}
