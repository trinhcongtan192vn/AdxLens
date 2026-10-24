'use client';

import { useFormatter } from 'next-intl';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Xu hướng theo ngày: chi tiêu (cột) và kết quả (đường), màu chart 1–2 (design-system). */
export function TrendChart({
  data,
  spendLabel,
  resultsLabel,
}: {
  data: { date: string; spend: number; results: number }[];
  spendLabel: string;
  resultsLabel: string;
}) {
  const format = useFormatter();
  const day = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return (
    <div className="h-64 w-full" role="img" aria-label={`${spendLabel} · ${resultsLabel}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--color-line, #E2E8F0)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={day} tick={{ fontSize: 11 }} />
          <YAxis
            yAxisId="s"
            tickFormatter={(v: number) => format.number(v, { notation: 'compact' })}
            tick={{ fontSize: 11 }}
          />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip
            labelFormatter={(l) => day(String(l))}
            formatter={(v) => format.number(Number(v), { maximumFractionDigits: 2 })}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="s" dataKey="spend" name={spendLabel} fill="#4F46E5" radius={[2, 2, 0, 0]} />
          <Line yAxisId="r" dataKey="results" name={resultsLabel} stroke="#0284C7" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
