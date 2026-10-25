import { describe, expect, it } from 'vitest';
import { authorizeUrl, CONNECT_SCOPES, connectScopes, READ_SCOPES, WRITE_SCOPES } from './oauth';

describe('oauth scopes', () => {
  it('P0–P1 chỉ xin quyền đọc; không xin email (Facebook Login for Business từ chối "Invalid Scopes: email")', () => {
    expect([...READ_SCOPES]).toEqual(['ads_read', 'business_management']);
    expect(READ_SCOPES).not.toContain('ads_management');
  });

  it('P2 thêm ads_management trên nền quyền đọc', () => {
    expect([...WRITE_SCOPES]).toEqual(['ads_read', 'business_management', 'ads_management']);
  });

  // ADR-0016 (PM chọn 24/10/2026): kết nối xin bộ quyền rộng một lần, như Madgicx. Test khóa danh sách để đổi quyền
  // phải đi qua ADR.
  it('kết nối xin bộ quyền rộng ADR-0016, không có email', () => {
    expect([...CONNECT_SCOPES]).toEqual([
      'ads_read',
      'business_management',
      'ads_management',
      'catalog_management',
      'pages_show_list',
      'pages_read_engagement',
      'pages_read_user_content',
      'pages_manage_ads',
      'pages_manage_posts',
      'pages_manage_engagement',
      'leads_retrieval',
      'instagram_basic',
    ]);
    expect(CONNECT_SCOPES).not.toContain('email');
  });

  it('ghi đè bộ quyền bằng env vẫn luôn giữ ads_read và bỏ trùng', () => {
    expect(connectScopes()).toEqual([...CONNECT_SCOPES]);
    expect(connectScopes(' business_management, pages_show_list ,pages_show_list')).toEqual([
      'ads_read',
      'business_management',
      'pages_show_list',
    ]);
    expect(connectScopes('ads_read,instagram_basic')).toEqual(['ads_read', 'instagram_basic']);
  });

  it('URL đăng nhập mang đúng scope, redirect_uri và state', () => {
    const u = new URL(
      authorizeUrl({
        apiVersion: 'v24.0',
        appId: '123',
        redirectUri: 'http://localhost:3000/api/v1/connections/meta/callback',
        state: 's1',
        scopes: READ_SCOPES,
      }),
    );
    expect(u.host).toBe('www.facebook.com');
    expect(u.pathname).toBe('/v24.0/dialog/oauth');
    expect(u.searchParams.get('scope')).toBe('ads_read,business_management');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/v1/connections/meta/callback');
    expect(u.searchParams.get('state')).toBe('s1');
  });
});
