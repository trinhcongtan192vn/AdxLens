import { NextResponse } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { supabaseServer } from '@/server/supabase';
import { WORKSPACE_COOKIE } from '@/server/route';

/** Đăng xuất (menu avatar X07): hủy phiên Supabase, xóa cookie workspace, về trang đăng nhập. */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(publicUrl('/login', req), 303);
  res.cookies.delete(WORKSPACE_COOKIE);
  return res;
}
