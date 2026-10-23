import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, testDb, truncateAll } from '@adxlens/db/testing';
import { asUser, call, installTestServer, uninstallTestServer } from '@/test-utils';
import type { RouteHandler } from '@/server/route';
import { workspaceFingerprint } from './fingerprint';
import { ROUTE_PROBES } from './probes';
import { seedWorld, type World } from './world';

const API_DIR = path.resolve(import.meta.dirname, '../../apps/web/src/app/api');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return name === 'route.ts' ? [full] : [];
  });
}

type Discovered = { key: string; urlPath: string; handler: RouteHandler };

async function discover(): Promise<Discovered[]> {
  const out: Discovered[] = [];
  for (const file of routeFiles(API_DIR)) {
    const rel = path.relative(API_DIR, path.dirname(file)).split(path.sep).join('/');
    const urlPath = `/api/${rel}`.replace(/\/$/, '');
    const mod = (await import(file)) as Record<string, unknown>;
    for (const m of METHODS) {
      const h = mod[m] as RouteHandler | undefined;
      if (typeof h === 'function') out.push({ key: `${m} ${urlPath}`, urlPath, handler: h });
    }
  }
  return out;
}

function fill(urlPath: string, params: Record<string, string>): string {
  return urlPath.replace(/\[(\w+)\]/g, (_, k: string) => params[k] ?? `missing-${k}`);
}

function assertNoLeak(body: unknown, world: World, key: string) {
  const text = JSON.stringify(body);
  for (const fp of world.bFingerprints) {
    expect(text.includes(fp), `${key} lộ dữ liệu workspace B: "${fp}"`).toBe(false);
  }
}

/** Thời gian cho test duyệt toàn bộ route / job (CI chậm hơn máy dev); không đổi assertion nào. */
const ISOLATION_SUITE_TIMEOUT_MS = 300_000;

const db = testDb();
let routes: Discovered[] = [];

beforeEach(async () => {
  await truncateAll(db);
  installTestServer(db);
  if (!routes.length) routes = await discover();
});
afterEach(() => uninstallTestServer());
afterAll(() => closeTestDb());

describe('cách ly workspace: route API', () => {
  it('mọi route API đều dựng bằng route() và có probe cách ly', async () => {
    const keys = routes.map((r) => r.key);
    expect(keys.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(r.handler.spec, `${r.key} phải dựng bằng route()`).toBeDefined();
    }
    const missing = keys.filter((k) => !(k in ROUTE_PROBES));
    expect(missing, 'Route mới chưa có probe trong tests/isolation/probes.ts').toEqual([]);
    const stale = Object.keys(ROUTE_PROBES).filter((k) => !keys.includes(k));
    expect(stale, 'Probe trỏ tới route không còn tồn tại').toEqual([]);
  });

  it(
    'gọi bằng ngữ cảnh A không trả về hay ghi đè dữ liệu B',
    async () => {
      for (const r of routes) {
        const probe = ROUTE_PROBES[r.key];
        if (!probe || probe.kind === 'exempt') continue;
        await truncateAll(db);
        const world = await seedWorld(db);
        const method = r.key.split(' ')[0]!;
        const bBefore = await workspaceFingerprint(db, world.b.workspace.id);
        const assertBUnchanged = async () =>
          expect(
            await workspaceFingerprint(db, world.b.workspace.id),
            `${r.key} làm thay đổi dữ liệu workspace B`,
          ).toBe(bBefore);

        if (probe.kind === 'user') {
          const res = await call(r.handler, {
            method,
            path: r.urlPath,
            user: asUser(world.a.owner),
            body: probe.body?.(world),
          });
          expect(res.status, r.key).toBeLessThan(500);
          assertNoLeak(res.body, world, r.key);
          await assertBUnchanged();
          continue;
        }

        const actor = probe.as === 'manager' ? world.a.manager : world.a.owner;
        const params = probe.params?.(world) ?? {};
        const query = probe.query?.(world);
        const qs = query ? `?${new URLSearchParams(query)}` : '';
        const res = await call(r.handler, {
          method,
          path: fill(r.urlPath, params) + qs,
          user: asUser(actor),
          workspaceId: world.a.workspace.id,
          params,
          body: probe.body?.(world),
        });
        expect(res.status, `${r.key}: ${JSON.stringify(res.body)}`).toBeLessThan(500);
        assertNoLeak(res.body, world, r.key);

        if (probe.crossParams) {
          const cross = probe.crossParams(world);
          const resB = await call(r.handler, {
            method,
            path: fill(r.urlPath, cross) + qs,
            user: asUser(actor),
            workspaceId: world.a.workspace.id,
            params: cross,
            body: probe.body?.(world),
          });
          expect([403, 404], `${r.key} với tài nguyên của B phải bị từ chối`).toContain(resB.status);
          assertNoLeak(resB.body, world, r.key);
        }

        if (probe.crossBody) {
          const resB = await call(r.handler, {
            method,
            path: fill(r.urlPath, params) + qs,
            user: asUser(actor),
            workspaceId: world.a.workspace.id,
            params,
            body: probe.crossBody(world),
          });
          expect([403, 404, 422], `${r.key} với body tham chiếu tài nguyên B phải bị từ chối`).toContain(resB.status);
          assertNoLeak(resB.body, world, r.key);
        }

        // Thành viên A không được dùng header để chuyển sang workspace B.
        const forged = await call(r.handler, {
          method,
          path: fill(r.urlPath, params) + qs,
          user: asUser(actor),
          workspaceId: world.b.workspace.id,
          params,
          body: probe.body?.(world),
        });
        expect([401, 403, 404], `${r.key} với X-Workspace-Id của B`).toContain(forged.status);
        await assertBUnchanged();
      }
      // Một test duyệt MỌI route (mỗi route: dựng lại 2 workspace + băm dữ liệu B) — thời gian tăng theo số route.
    },
    ISOLATION_SUITE_TIMEOUT_MS,
  );

  it('chọn workspace của người khác bị từ chối', async () => {
    const world = await seedWorld(db);
    const r = routes.find((x) => x.key === 'POST /api/v1/me/workspace')!;
    const res = await call(r.handler, {
      user: asUser(world.a.owner),
      body: { workspaceId: world.b.workspace.id },
    });
    expect(res.status).toBe(403);
  });
});
