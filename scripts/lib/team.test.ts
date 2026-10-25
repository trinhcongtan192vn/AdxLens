import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- module .mjs không có khai báo kiểu
import {
  formatDuration,
  listeningPid,
  needsInstall,
  PREVIEW_PORT,
  previewDirOf,
  previewEnv,
  promoteTarget,
  teamDirOf,
} from './team.mjs';

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

  it('bản xem trước: thư mục -preview, cổng 3100, Redis db 1, không job định kỳ', () => {
    expect(previewDirOf(path.join('E:', 'VideCode', 'AdxLens'))).toBe(`${path.resolve('E:/VideCode/AdxLens')}-preview`);
    expect(PREVIEW_PORT).not.toBe(3000);
    expect(previewEnv('redis://127.0.0.1:6379')).toEqual({
      APP_URL: 'http://localhost:3100',
      PUBLIC_REPORT_URL: 'http://localhost:3100/r',
      REDIS_URL: 'redis://127.0.0.1:6379/1',
      WORKER_SCHEDULES: 'off',
      PORT: '3100',
    });
  });

  it('đưa lên team: đúng commit đã xem trước nếu còn trong develop; không thì develop mới nhất', () => {
    const a = 'a'.repeat(40);
    const b = 'b'.repeat(40);
    expect(promoteTarget({ previewCommit: a, developHead: b, isAncestor: () => true })).toEqual({
      commit: a,
      source: 'preview',
    });
    expect(promoteTarget({ previewCommit: a, developHead: b, isAncestor: () => false })).toEqual({
      commit: b,
      source: 'develop',
    });
    expect(promoteTarget({ previewCommit: null, developHead: b, isAncestor: () => true })).toEqual({
      commit: b,
      source: 'develop',
    });
    expect(promoteTarget({ previewCommit: 'rác', developHead: b, isAncestor: () => true }).source).toBe('develop');
  });
});
