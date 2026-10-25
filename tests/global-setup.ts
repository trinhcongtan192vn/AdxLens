import { loadTestEnv } from './load-test-env';

/** Chuẩn bị môi trường chung cho `pnpm test`: nạp env, tạo database test và chạy migration. */
export default async function globalSetup(): Promise<void> {
  loadTestEnv();
  const { prepareTestDatabase } = await import('@adxlens/db/testing');
  const url = await prepareTestDatabase();
  process.env.TEST_DATABASE_URL = url;
}
