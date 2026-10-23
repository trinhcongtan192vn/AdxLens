import 'server-only';
import { supabaseServer } from './supabase';

export type AccountOps = {
  changePassword(password: string): Promise<{ ok: boolean; code?: string }>;
  signOutOthers(): Promise<void>;
};

const supabaseAccount: AccountOps = {
  async changePassword(password) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.updateUser({ password });
    if (error) return { ok: false, code: error.code };
    await sb.auth.signOut({ scope: 'others' });
    return { ok: true };
  },
  async signOutOthers() {
    const sb = await supabaseServer();
    await sb.auth.signOut({ scope: 'others' });
  },
};

let ops: AccountOps = supabaseAccount;
export function account(): AccountOps {
  return ops;
}
export function setAccountOpsForTest(o: AccountOps | null): void {
  if (process.env.APP_ENV !== 'test') throw new Error('setAccountOpsForTest chỉ dùng trong test');
  ops = o ?? supabaseAccount;
}
