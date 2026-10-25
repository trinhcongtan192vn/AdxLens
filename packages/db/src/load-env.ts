import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Nạp .env.local ở gốc repo cho script CLI (không ghi đè biến đã có). */
export function loadRootEnv(): void {
  const file = fileURLToPath(new URL('../../../.env.local', import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}
