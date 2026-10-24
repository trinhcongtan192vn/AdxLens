import { describe, expect, it } from 'vitest';
import { authorizeUrl, READ_SCOPES, WRITE_SCOPES } from './oauth';

describe('oauth scopes', () => {
  it('P0–P1 chỉ xin quyền đọc; không xin email (Facebook Login for Business từ chối "Invalid Scopes: email")', () => {
    expect([...READ_SCOPES]).toEqual(['ads_read', 'business_management']);
    expect(READ_SCOPES).not.toContain('ads_management');
  });

  it('P2 thêm ads_management trên nền quyền đọc', () => {
    expect([...WRITE_SCOPES]).toEqual(['ads_read', 'business_management', 'ads_management']);
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
