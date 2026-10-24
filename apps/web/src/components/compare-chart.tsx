'use client';

import { useFormatter } from 'next-intl';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const COLORS = ['#4F46E5', '#0284C7', '#D97706', '#16A34A'];

/** P104: một chỉ số theo ngày cho 2–4 creative (màu chart 1–4 của design system). */
export function CompareChart({
  data,
  series,
  label,
  percent,
}: {
  data: Record<string, number | string | null>[];
  series: { key: string; name: string }[];
  label: string;
  percent?: boolean;
}) {
  const format = useFormatter();
  const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const fmt = (v: number) =>
    percent
      ? format.number(v, { style: 'percent', maximumFractionDigits: 2 })
      : format.number(v, { notation: 'compact', maximumFractionDigits: 1 });
  return (
    <div className="h-56 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--color-line, #E2E8F0)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} />
          <Tooltip labelFormatter={(l) => day(String(l))} formatter={(v) => fmt(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
