import { lazy, type ComponentType } from 'react';

/** 把具名 export 的頁面拆成獨立 chunk，避免一進站就下載整包後台。 */
export function lazyPage<M extends Record<string, unknown>, K extends keyof M>(
  importer: () => Promise<M>,
  name: K,
) {
  return lazy(async () => {
    const mod = await importer();
    return { default: mod[name] as ComponentType };
  });
}
