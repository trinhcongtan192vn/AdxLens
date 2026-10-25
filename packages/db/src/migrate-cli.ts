import { loadRootEnv } from './load-env';
import { runMigrations } from './migrate';

loadRootEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write('DATABASE_URL chưa cấu hình\n');
  process.exit(1);
}
await runMigrations(url);
process.stdout.write('Migration xong.\n');
