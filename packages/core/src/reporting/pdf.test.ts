import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '@adxlens/db';
import {
  closeTestDb,
  seedAdAccount,
  seedClient,
  seedConnection,
  seedWorkspace,
  testDb,
  truncateAll,
} from '@adxlens/db/testing';
import { recordingEnqueue } from '@adxlens/jobs';
import { SYSTEM_ACTOR } from '@adxlens/core/shared';
import { resolveActor } from '@adxlens/core/tenancy';
import { pdfPathFor, pdfStatus, renderReportPdf, requestPdf } from './index';

const db = testDb();
beforeEach(() => truncateAll(db));
afterAll(() => closeTestDb());

async function readyReport(confirmed = true) {
  const { workspace, owner } = await seedWorkspace(db);
  const ctx = { db, workspaceId: workspace.id, actor: (await resolveActor(db, workspace.id, owner.id))! };
  const client = await seedClient(db, workspace.id, 'Linh');
  const conn = await seedConnection(db, workspace.id, owner.id);
  await seedAdAccount(db, workspace.id, conn.id, { clientId: client.id, confirmed });
  const builtAt = new Date('2026-10-23T03:00:00Z');
  const [r] = await db
    .insert(schema.reports)
    .values({
      workspaceId: workspace.id,
      clientId: client.id,
      kind: 'periodic',
      dateFrom: '2026-10-16',
      dateTo: '2026-10-22',
      locale: 'vi',
      status: 'ready',
      content: {},
      templateVersion: 'v1',
      createdBy: owner.id,
      builtAt,
    })
    .returning();
  return { ctx, reportId: r!.id, version: String(builtAt.getTime()), ws: workspace.id };
}

describe('PDF báo cáo (R07)', () => {
  it('yêu cầu → enqueue theo phiên bản dựng; render → lưu đường dẫn; lần sau → ready', async () => {
    const { ctx, reportId, version, ws } = await readyReport();
    const enqueue = recordingEnqueue();
    expect(await requestPdf(ctx, reportId, { enqueue })).toMatchObject({ state: 'queued' });
    expect(enqueue.calls).toEqual([{ name: 'pdf:render', payload: { workspaceId: ws, reportId, version } }]);
    const uploads = new Map<string, Uint8Array>();
    const urls: string[] = [];
    const st = await renderReportPdf(
      { ...ctx, actor: SYSTEM_ACTOR },
      { reportId, version },
      {
        printUrl: (id) => `http://app/print/report/${id}?key=k`,
        render: async (u) => {
          urls.push(u);
          return new Uint8Array([37, 80, 68, 70]);
        },
        upload: async (p, b) => void uploads.set(p, b),
      },
    );
    expect(st).toBe('done');
    expect(urls).toEqual([`http://app/print/report/${reportId}?key=k`]);
    expect([...uploads.keys()]).toEqual([pdfPathFor(ws, reportId, version)]);
    expect(await pdfStatus(ctx, reportId)).toEqual({ state: 'ready', path: pdfPathFor(ws, reportId, version) });
    expect((await requestPdf(ctx, reportId, { enqueue })).state).toBe('ready');
    expect(enqueue.calls).toHaveLength(1);

    // Dựng lại → phiên bản mới → PDF cũ không còn đúng; job phiên bản cũ bị bỏ qua.
    await db
      .update(schema.reports)
      .set({ builtAt: new Date('2026-10-24T00:00:00Z') })
      .where(eq(schema.reports.id, reportId));
    expect((await pdfStatus(ctx, reportId)).state).toBe('none');
    const stale = await renderReportPdf(
      { ...ctx, actor: SYSTEM_ACTOR },
      { reportId, version },
      {
        printUrl: () => '',
        render: async () => new Uint8Array(),
        upload: async () => {},
      },
    );
    expect(stale).toBe('stale');
  });

  it('chưa toàn vẹn → không xuất PDF (ADR-0007): API 422, job bỏ qua', async () => {
    const { ctx, reportId, version } = await readyReport(false);
    await expect(requestPdf(ctx, reportId, { enqueue: recordingEnqueue() })).rejects.toMatchObject({
      code: 'REPORT_BLOCKED',
    });
    let rendered = false;
    const st = await renderReportPdf(
      { ...ctx, actor: SYSTEM_ACTOR },
      { reportId, version },
      {
        printUrl: () => '',
        render: async () => {
          rendered = true;
          return new Uint8Array();
        },
        upload: async () => {},
      },
    );
    expect(st).toBe('blocked');
    expect(rendered).toBe(false);
  });
});
