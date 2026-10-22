import 'server-only';
import { getDb, type Db } from '@adxlens/db';
import { setFlagCache } from '@adxlens/core/flags';
import { redisFlagCache } from './redis';

let initialized = false;

/** DB dùng chung trong tiến trình web; lần đầu gắn cache cờ Redis. */
export function db(): Db {
  if (!initialized) {
    initialized = true;
    if (process.env.APP_ENV !== 'test') setFlagCache(redisFlagCache());
  }
  return getDb();
}
