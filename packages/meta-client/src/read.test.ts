import { describe, expect, it } from 'vitest';
import type { MetaHttp } from './http';
import { HttpMetaRead, THUMB_PX } from './read';

describe('đọc creative', () => {
  it('xin thumbnail 720×720 thay cho ảnh 64×64 mặc định của Meta (ảnh không mờ)', async () => {
    let params: Record<string, unknown> = {};
    const http = {
      paginate: async (_path: string, _t: string, p: Record<string, unknown>) => {
        params = p;
        return [];
      },
    } as unknown as MetaHttp;
    await new HttpMetaRead(http).listCreatives('t', 'act_1');
    expect(THUMB_PX).toBeGreaterThanOrEqual(600);
    expect(params).toMatchObject({ thumbnail_width: THUMB_PX, thumbnail_height: THUMB_PX });
  });
});
