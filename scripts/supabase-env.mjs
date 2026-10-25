// `node scripts/supabase-env.mjs`: ghi infra/supabase/.env (biến cho env(...) trong config.toml) từ .env.local.
// Không có .env.local (CI) → giá trị local. In "changed" nếu nội dung đổi (Supabase đang chạy cần khởi động lại).
import { syncSupabaseEnv } from './lib/supabase-env.mjs';

const { changed } = syncSupabaseEnv();
console.log(changed ? 'infra/supabase/.env: changed' : 'infra/supabase/.env: unchanged');
