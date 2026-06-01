/**
 * whisper-worker.js  (classic worker)
 * 静的 import の代わりに動的 import() を使用。
 * module Worker の読み込み失敗を回避するため type:module を使わない。
 */

let cachedPipeline = null;
let cachedModelId = null;
let transformersModule = null;

async function loadTransformers() {
  if (transformersModule) return transformersModule;
  transformersModule = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
  transformersModule.env.allowLocalModels = false;
  return transformersModule;
}

self.onmessage = async ({ data }) => {
  const { type } = data;

  if (type === 'load') {
    const { modelId } = data;

    if (cachedModelId === modelId && cachedPipeline) {
      self.postMessage({ type: 'loaded' });
      return;
    }

    try {
      self.postMessage({ type: 'progress', phase: 'start' });

      const { pipeline } = await loadTransformers();
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
