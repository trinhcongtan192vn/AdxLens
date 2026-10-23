// `pnpm tokens:rotate` — xoay khóa mã hóa token Meta (runbook docs/runbooks/rotate-token-key.md): đặt
// TOKEN_ENC_KEY_V2 (khóa mới) cùng TOKEN_ENC_KEY_V1, chạy lệnh này để mã hóa lại mọi kết nối bằng V2. Chỉ in số
// lượng, không bao giờ in token.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { keysFromEnv, reencryptWorkspaceTokens } from '@adxlens/core/connections';
import { createDb, schema } from '@adxlens/db';

const envFile = path.resolve(import.meta.dirname, '../../../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  if (!process.env.DATABASE_URL || !process.env.TOKEN_ENC_KEY_V1)
    throw new Error('Thiếu DATABASE_URL / TOKEN_ENC_KEY_V1');
  if (!process.env.TOKEN_ENC_KEY_V2) throw new Error('Đặt TOKEN_ENC_KEY_V2 (khóa mới) trước khi xoay.');
  const keys = keysFromEnv({
    TOKEN_ENC_KEY_V1: process.env.TOKEN_ENC_KEY_V1,
    TOKEN_ENC_KEY_V2: process.env.TOKEN_ENC_KEY_V2,
  });
  const { db, close } = createDb(process.env.DATABASE_URL);
  try {
    // Duyệt từng workspace (danh sách id) — xử lý trong ngữ cảnh đúng workspace.
    const wss = await db.select({ id: schema.workspaces.id }).from(schema.workspaces);
    let rotated = 0;
    for (const w of wss) rotated += (await reencryptWorkspaceTokens({ db, workspaceId: w.id }, keys)).rotated;
    console.log(`Đã mã hóa lại ${rotated} kết nối bằng khóa V${keys.current}.`);
  } finally {
    await close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'lỗi');
  process.exit(1);
});
