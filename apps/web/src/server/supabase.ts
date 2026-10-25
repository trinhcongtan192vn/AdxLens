import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Supabase chưa cấu hình (SUPABASE_URL, SUPABASE_ANON_KEY)');
  return { url, anon };
}

/** Client theo phiên người dùng (cookie), dùng trong Server Component, Route Handler, Server Action. */
export async function supabaseServer() {
  const { url, anon } = publicConfig();
  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // Server Component không ghi được cookie; middleware làm mới phiên.
        }
      },
    },
  });
}

/** Client quản trị (service role): chỉ dùng phía server cho thao tác Auth cần quyền admin. */
export function supabaseAdmin() {
  const { url } = publicConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY chưa cấu hình');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
