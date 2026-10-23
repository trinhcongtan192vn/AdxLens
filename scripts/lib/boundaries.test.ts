import { describe, expect, it } from 'vitest';
// @ts-expect-error -- module .mjs không có khai báo kiểu
import { findViolations } from './boundaries.mjs';

const check = (file: string, source: string): string[] => findViolations([{ file, source }]);

describe('findViolations', () => {
  it('chặn import phần ghi Meta ngoài execution', () => {
    expect(
      check('packages/core/src/insight/x.ts', `import { pauseAd } from '@adxlens/meta-client/write';`),
    ).toHaveLength(1);
    expect(check('apps/worker/src/x.ts', `import { w } from '@adxlens/meta-client/write';`)).toHaveLength(1);
  });

  it('apps/web không được giải mã token Meta; worker được', () => {
    const src = `import { withConnectionToken } from '@adxlens/core/connections';`;
    expect(check('apps/web/src/app/api/x/route.ts', src)).toHaveLength(1);
    expect(check('apps/worker/src/handlers/sync.ts', src)).toEqual([]);
  });

  it('cho phép execution import phần ghi Meta', () => {
    expect(check('packages/core/src/execution/executor.ts', `import { w } from '@adxlens/meta-client/write';`)).toEqual(
      [],
    );
  });

  it('chặn import sâu vào module core', () => {
    expect(check('apps/web/app/page.tsx', `import { x } from '@adxlens/core/tenancy/repo';`)).toHaveLength(1);
    expect(check('apps/web/app/page.tsx', `import { x } from '@adxlens/core/tenancy';`)).toEqual([]);
  });

  it('chặn import tương đối giữa các module core', () => {
    expect(check('packages/core/src/reporting/a.ts', `import { x } from '../insight/engine';`)).toHaveLength(1);
    expect(check('packages/core/src/reporting/a.ts', `import { x } from './b';`)).toEqual([]);
    expect(check('packages/core/src/reporting/sub/a.ts', `import { x } from '../b';`)).toEqual([]);
  });

  it('phần dùng chung (core/src/shared) cũng chỉ import qua "@adxlens/core/shared"', () => {
    expect(check('packages/core/src/reporting/a.ts', `import { AppError } from '../shared/errors';`)).toHaveLength(1);
    expect(check('packages/core/src/reporting/a.ts', `import { AppError } from '@adxlens/core/shared';`)).toEqual([]);
  });
});
