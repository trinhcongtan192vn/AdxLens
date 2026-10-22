import type { FlagCache } from './service';

/** Cache trong bộ nhớ, dùng cho test và dev không có Redis. */
export function memoryFlagCache(): FlagCache & { store: Map<string, boolean> } {
  const store = new Map<string, boolean>();
  return {
    store,
    get: async (k) => store.get(k),
    set: async (k, v) => {
      store.set(k, v);
    },
    del: async (k) => {
      store.delete(k);
    },
  };
}
