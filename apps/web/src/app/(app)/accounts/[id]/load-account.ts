import 'server-only';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { listAdAccounts } from '@adxlens/core/connections';
import { getPageContext } from '@/server/page-context';

/** Tài khoản QC mà người xem được phép thấy (buyer: chỉ Client được gán); không thì 404. */
export async function loadAccount(id: string) {
  const pc = await getPageContext();
  if (!z.string().uuid().safeParse(id).success) notFound();
  const account = (await listAdAccounts(pc.ctx)).find((a) => a.id === id);
  if (!account) notFound();
  return { pc, account };
}
