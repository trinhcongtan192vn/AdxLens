import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicUrl } from '@/lib/public-url';

/** Đường dẫn công khai: trang marketing, xác thực, báo cáo công khai, API (API tự kiểm phiên). */
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/invite',
  '/r/',
  '/api/',
  '/pricing',
  '/privacy',
  '/terms',
  '/data-deletion',
  '/break-even',
  '/print/',
];

function isPublic(pathname: string): boolean {
  return pathname === '/' || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** Làm mới phiên Supabase (cookie) và chặn trang app khi chưa đăng nhập. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) request.cookies.set(c.name, c.value);
        response = NextResponse.next({ request });
        for (const c of list) response.cookies.set(c.name, c.value, c.options);
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  if (!user && !isPublic(pathname)) {
    // Origin công khai, không theo request.url (sau Cloudflare Tunnel là localhost).
    return NextResponse.redirect(publicUrl(`/login?next=${encodeURIComponent(pathname + search)}`, request));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
