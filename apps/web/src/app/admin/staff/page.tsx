import { getFormatter, getTranslations } from 'next-intl/server';
import { listStaff } from '@adxlens/core/ops';
import { Badge, Card, PageHeader, Table, TBody, TD, TH, THead, TR } from '@adxlens/ui';
import { requireStaff } from '@/server/admin-context';
import { deps } from '@/server/deps';
import { AddStaffForm, StaffRowActions } from './staff-actions';

export async function generateMetadata() {
  const t = await getTranslations('admin.staff');
  return { title: t('title') };
}

/** Đội AdxLens (ADR-0013): mọi staff xem; superadmin thêm, đổi vai trò, gỡ. */
export default async function AdminStaffPage() {
  const { staff, user } = await requireStaff();
  const t = await getTranslations('admin');
  const format = await getFormatter();
  const rows = await listStaff(deps().db);
  const isSuper = staff.role === 'superadmin';
  return (
    <>
      <PageHeader title={t('staff.title')} />
      <p className="mb-3 max-w-[720px] text-body text-fg-secondary">{t('staff.body')}</p>
      {isSuper ? <AddStaffForm /> : null}
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>{t('staff.cols.email')}</TH>
              <TH>{t('staff.cols.name')}</TH>
              <TH>{t('staff.cols.role')}</TH>
              <TH>{t('staff.cols.since')}</TH>
              {isSuper ? <TH>{t('staff.cols.actions')}</TH> : null}
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.userId} data-testid={`staff-${r.email}`}>
                <TD className="font-medium">{r.email}</TD>
                <TD muted>{r.fullName ?? '—'}</TD>
                <TD>
                  <Badge tone={r.role === 'superadmin' ? 'brand' : 'neutral'}>{t(`roles.${r.role}`)}</Badge>
                </TD>
                <TD muted>{format.dateTime(r.createdAt, { dateStyle: 'short' })}</TD>
                {isSuper ? (
                  <TD>
                    {r.userId === user.id ? (
                      <span className="text-small text-fg-tertiary">{t('staff.you')}</span>
                    ) : (
                      <StaffRowActions userId={r.userId} email={r.email} role={r.role} />
                    )}
                  </TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
