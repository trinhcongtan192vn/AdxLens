// Ghi infra/supabase/.env từ .env.local (dùng chung cho start-local, dev, CI).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { devPublicConfig, supabaseEnvFile } from './start-local.mjs';

export const SUPABASE_ENV_PATH = 'infra/supabase/.env';

export function syncSupabaseEnv(envLocalPath = '.env.local') {
  const cfg = devPublicConfig(existsSync(envLocalPath) ? readFileSync(envLocalPath, 'utf8') : '');
  const next = supabaseEnvFile(cfg);
  const prev = existsSync(SUPABASE_ENV_PATH) ? readFileSync(SUPABASE_ENV_PATH, 'utf8') : null;
  if (prev !== next) writeFileSync(SUPABASE_ENV_PATH, next);
  return { cfg, changed: prev !== next, existed: prev !== null };
}
