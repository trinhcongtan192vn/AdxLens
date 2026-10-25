import { describe, expect, it } from 'vitest';
import { escapeHtml, invitationEmail } from './index';

describe('email', () => {
  it('escape dữ liệu người dùng trong HTML', () => {
    expect(escapeHtml(`<script>alert("x")</script>&'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;&#39;',
    );
  });

  it('email mời song ngữ, tên workspace độc hại bị escape', () => {
    const base = {
      to: 'a@b.vn',
      workspaceName: '<img src=x onerror=alert(1)>',
      inviterName: 'Hà',
      role: 'buyer' as const,
      link: 'http://localhost:3000/invite/tok',
      days: 7,
    };
    const vi = invitationEmail({ ...base, locale: 'vi' });
    const en = invitationEmail({ ...base, locale: 'en' });
    expect(vi.html).not.toContain('<img src=x');
    expect(vi.html).toContain('Chấp nhận lời mời');
    expect(en.html).toContain('Accept invitation');
    expect(vi.text).toContain(base.link);
    expect(vi.text).toContain('Media buyer');
  });
});
