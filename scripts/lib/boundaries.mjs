// Kiểm tra ranh giới import theo CLAUDE.md. Thuần hàm để test được.
import path from 'node:path';

const CORE_DIR = 'packages/core/src/';
const EXECUTION_DIR = 'packages/core/src/execution/';
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function coreModuleOf(posixFile) {
  if (!posixFile.startsWith(CORE_DIR)) return null;
  const rest = posixFile.slice(CORE_DIR.length);
  const seg = rest.split('/')[0];
  return rest.includes('/') ? seg : null;
}

/**
 * @param {{file: string, source: string}[]} files đường dẫn tương đối từ gốc repo
 * @returns {string[]} danh sách vi phạm
 */
export function findViolations(files) {
  const violations = [];
  for (const { file, source } of files) {
    const posixFile = toPosix(file);
    const fromModule = coreModuleOf(posixFile);

    // 0. Token Meta chỉ được giải mã trong worker (quy tắc tuyệt đối 2): web không dùng hàm giải mã.
    if (posixFile.startsWith('apps/web/') && /\b(withConnectionToken|decryptToken)\b/.test(source)) {
      violations.push(`${posixFile}: apps/web không được giải mã token Meta (chỉ worker)`);
    }
    for (const m of source.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;

      // 1. Chỉ Execution Gateway được dùng phần ghi của meta-client (quy tắc tuyệt đối 3).
      if (spec.startsWith('@adxlens/meta-client/write') && !posixFile.startsWith(EXECUTION_DIR)) {
        violations.push(`${posixFile}: chỉ packages/core/execution được import "${spec}"`);
      }

      // 2. Không import sâu vào module core: chỉ "@adxlens/core/<module>".
      const deep = spec.match(/^@adxlens\/core\/([^/]+)\/(.+)$/);
      if (deep) {
        violations.push(`${posixFile}: import sâu "${spec}"; dùng "@adxlens/core/${deep[1]}"`);
      }

      // 3. Trong core, import tương đối không được vượt sang module khác.
      if (fromModule && spec.startsWith('.')) {
        const target = toPosix(path.posix.normalize(path.posix.join(path.posix.dirname(posixFile), spec)));
        const toModule =
          coreModuleOf(target.endsWith('.ts') ? target : `${target}.ts`) ?? coreModuleOf(`${target}/index.ts`);
        if (target.startsWith(CORE_DIR) && toModule && toModule !== fromModule) {
          violations.push(`${posixFile}: import tương đối sang module "${toModule}"; dùng "@adxlens/core/${toModule}"`);
        }
      }
    }
  }
  return violations;
}
