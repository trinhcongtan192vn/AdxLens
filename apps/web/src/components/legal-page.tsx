import type { ReactNode } from 'react';

/** Khung trang chính sách M03–M05. Nội dung giữ chỗ, cần pháp lý duyệt (ux-requirements 9). */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
  children,
}: {
  title: string;
  updated?: string;
  intro?: string;
  sections: { title: string; body: ReactNode }[];
  children?: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-[720px] px-6 py-14">
      <h1 className="text-h1 font-semibold text-fg">{title}</h1>
      {updated ? <p className="mt-1 text-small text-fg-tertiary">{updated}</p> : null}
      {intro ? <p className="mt-4 text-body text-fg-secondary">{intro}</p> : null}
      {sections.map((s) => (
        <section key={s.title} className="mt-6">
          <h2 className="text-h3 font-semibold text-fg">{s.title}</h2>
          <div className="mt-1 text-body text-fg-secondary">{s.body}</div>
        </section>
      ))}
      {children}
    </article>
  );
}
