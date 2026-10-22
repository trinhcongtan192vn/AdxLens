'use client';

/** Lỗi API theo chuẩn L3 10.1: { error: { code, message, details } }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Gọi REST /api/v1 từ client (cookie phiên + cookie workspace đi kèm tự động). */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; workspaceId?: string } = {},
): Promise<T> {
  const res = await fetch(path.startsWith('/') ? path : `/api/v1/${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.workspaceId ? { 'x-workspace-id': init.workspaceId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (
      data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }
    ).error;
    throw new ApiError(
      res.status,
      e?.code ?? 'INTERNAL',
      e?.message ?? res.statusText,
      e?.details ?? {},
    );
  }
  return data as T;
}
