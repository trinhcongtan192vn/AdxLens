import { NextResponse } from 'next/server';
import { listWorkspacesForUser, upsertUser } from '@adxlens/core/tenancy';
import { publicUrl } from '@/lib/public-url';
import { safeNext } from '@/server/auth-flows';
import { deps } from '@/server/deps';
import { supabaseServer } from '@/server/supabase';

/**
 * Nhận link từ email Supabase (xác minh, đặt lại mật khẩu): đổi mã PKCE lấy phiên, đồng bộ hồ sơ
 * vào app.users, chuyển tới `next` nội bộ, hoặc tạo workspace nếu chưa có (ADR-0003). Redirect theo origin công khai
 * (`publicUrl`), không theo `req.url` — sau Cloudflare Tunnel `req.url` là localhost.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const sb = await supabaseServer();
  if (!code) return NextResponse.redirect(publicUrl('/login', req));
  const { data, error } = await sb.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) {
    const target = next === '/reset-password' ? '/reset-password?expired=1' : '/login?expired=1';
    return NextResponse.redirect(publicUrl(target, req));
  }
  const { db } = deps();
  const fullName = (data.user.user_metadata?.full_name as string | undefined) ?? null;
  await upsertUser(db, { id: data.user.id, email: data.user.email, fullName });
  if (next) return NextResponse.redirect(publicUrl(safeNext(next), req));
  const workspaces = await listWorkspacesForUser(db, data.user.id);
  return NextResponse.redirect(publicUrl(workspaces.length ? '/overview' : '/onboarding/workspace', req));
}
