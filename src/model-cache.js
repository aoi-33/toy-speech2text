/**
 * model-cache.js
 * ブラウザの Cache Storage を使ったモデルキャッシュの管理ユーティリティ。
 */

const CACHE_NAME = 'transformers-cache';

// モデルごとのおおよそのサイズ（量子化 ONNX ファイルの合計）
const MODEL_APPROX_SIZES = {
  'Xenova/whisper-tiny': '約75 MB',
  'Xenova/whisper-small': '約240 MB',
  'Xenova/whisper-medium': '約770 MB',
};

/**
 * モデルの目安サイズを返す。
 * @param {string} modelId
 * @returns {string}
 */
export function getApproxSize(modelId) {
  return MODEL_APPROX_SIZES[modelId] ?? '不明';
}

/**
 * モデルがキャッシュ済みか調べる。
 * @param {string} modelId
 * @returns {Promise<boolean>}
 */
export async function isModelCached(modelId) {
  if (!('caches' in window)) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    return keys.some((req) => req.url.includes(modelId));
  } catch {
    return false;
  }
}

/**
 * モデルのキャッシュを削除する。
 * @param {string} modelId
 * @returns {Promise<number>} 削除したエントリ数
 */
export async function deleteModelCache(modelId) {
  if (!('caches' in window)) return 0;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const targets = keys.filter((req) => req.url.includes(modelId));
    await Promise.all(targets.map((req) => cache.delete(req)));
    return targets.length;
  } catch {
    return 0;
  }
}
