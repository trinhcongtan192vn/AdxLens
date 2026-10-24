import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- module .mjs không có khai báo kiểu
import { formatDuration, listeningPid, needsInstall, teamDirOf } from './team.mjs';

describe('bản team test', () => {
  it('thư mục team nằm cạnh thư mục dev', () => {
    expect(teamDirOf(path.join('E:', 'VideCode', 'AdxLens'))).toBe(`${path.resolve('E:/VideCode/AdxLens')}-team`);
  });

  it('PID đang nghe ở cổng từ netstat (IPv4 / IPv6, bỏ cổng khác và kết nối không LISTENING)', () => {
    const out = [
      '  Proto  Local Address          Foreign Address        State           PID',
      '  TCP    0.0.0.0:30000          0.0.0.0:0              LISTENING       11',
      '  TCP    127.0.0.1:3000         127.0.0.1:5000         ESTABLISHED     22',
      '  TCP    [::]:3000              [::]:0                 LISTENING       4242',
    ].join('\r\n');
    expect(listeningPid(out, 3000)).toBe(4242);
    expect(listeningPid(out, 8080)).toBeNull();
  });

  it('chỉ cài lại phụ thuộc khi cần', () => {
    expect(needsInstall({ created: false, hasModules: true, changedFiles: 'apps/web/a.ts\n' })).toBe(false);
    expect(needsInstall({ created: false, hasModules: true, changedFiles: 'a.ts\npnpm-lock.yaml\n' })).toBe(true);
    expect(needsInstall({ created: true, hasModules: true, changedFiles: '' })).toBe(true);
    expect(needsInstall({ created: false, hasModules: false, changedFiles: '' })).toBe(true);
  });

  it('định dạng thời gian gián đoạn', () => {
    expect(formatDuration(4321)).toBe('4,3 giây');
    expect(formatDuration(65_000)).toBe('1 phút 5 giây');
  });
});
