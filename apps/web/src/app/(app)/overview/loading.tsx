import { Card, Skeleton } from '@adxlens/ui';

/** O01 · đang tải (Penpot): khung KPI + bảng skeleton. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-4 h-7 w-40" />
      <Card className="mb-4 flex gap-6 px-4 py-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-36" />
        ))}
      </Card>
      <Card className="space-y-2 px-4 py-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </Card>
    </div>
  );
}
