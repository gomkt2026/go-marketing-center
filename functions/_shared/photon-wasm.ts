import type { PhotonImage } from '@cf-wasm/photon';

export type PhotonApi = typeof import('@cf-wasm/photon');
export type { PhotonImage };

let cached: Promise<PhotonApi> | null = null;

/**
 * 延後 instantiate Photon WASM。
 * Pages Functions 會把所有 API 打成同一個 Worker；若在模組頂層 import @cf-wasm/photon，
 * 每次 isolate 啟動都會 sync init 1.5MB WASM，登入／health 也會 1102。
 */
export function loadPhoton(): Promise<PhotonApi> {
  cached ??= import('@cf-wasm/photon');
  return cached;
}
