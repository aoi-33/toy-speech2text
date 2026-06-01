/**
 * whisper-worker.js
 * Web Worker として動作し、重い ONNX 推論をメインスレッドから分離する。
 *
 * メインスレッド → Worker のメッセージ:
 *   { type: 'load', modelId }            モデルをロード（キャッシュ済みなら即完了）
 *   { type: 'transcribe', id, audio, options }  推論実行
 *
 * Worker → メインスレッドのメッセージ:
 *   { type: 'progress', phase: 'download'|'init', pct? }
 *   { type: 'loaded' }
 *   { type: 'result', id, text }
 *   { type: 'error', message, id? }
 */

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

env.allowLocalModels = false;

let cachedPipeline = null;
let cachedModelId = null;

self.onmessage = async ({ data }) => {
  const { type } = data;

  if (type === 'load') {
    const { modelId } = data;

    if (cachedModelId === modelId && cachedPipeline) {
      self.postMessage({ type: 'loaded' });
      return;
    }

    try {
      // ロード開始を即座に通知（キャッシュ済みの場合 progress イベントが来ないため）
      self.postMessage({ type: 'progress', phase: 'start' });
      let initFired = false;
      cachedPipeline = await pipeline('automatic-speech-recognition', modelId, {
        device: self.navigator?.gpu ? 'webgpu' : 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total > 0 && p.loaded != null) {
            self.postMessage({
              type: 'progress',
              phase: 'download',
              pct: Math.round((p.loaded / p.total) * 100),
            });
          } else if (p.status === 'done' && !initFired) {
            initFired = true;
            self.postMessage({ type: 'progress', phase: 'init' });
          }
        },
      });
      cachedModelId = modelId;
      self.postMessage({ type: 'loaded' });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
    }
  }

  if (type === 'transcribe') {
    const { id, audio, options } = data;
    try {
      const result = await cachedPipeline(audio, options);
      self.postMessage({ type: 'result', id, text: result.text ?? '' });
    } catch (err) {
      self.postMessage({ type: 'error', id, message: err.message });
    }
  }
};
