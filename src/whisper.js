/**
 * whisper.js
 * Whisper.js（@xenova/transformers）による音声認識処理。
 * DOM には一切触れない。
 */

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

env.allowLocalModels = false;
// マルチスレッド WASM は GitHub Pages 非対応（SharedArrayBuffer 未対応）のため無効化
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

let cachedModel = null;
let cachedModelId = null;

let micStream = null;
let currentRecorder = null;
let isRecording = false;

export function getDevice() {
  return navigator.gpu ? 'webgpu' : 'wasm';
}

/**
 * モデルをロードする。キャッシュ済みなら即返す。
 * @param {string} modelId
 * @param {(pct: number) => void} [onProgress]
 * @param {() => void} [onInit] - ダウンロード完了・ONNX 初期化開始時
 */
export async function loadModel(modelId, onProgress, onInit) {
  if (cachedModelId === modelId && cachedModel !== null) {
    return cachedModel;
  }

  const device = getDevice();
  let initFired = false;

  const model = await pipeline('automatic-speech-recognition', modelId, {
    device,
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total > 0 && p.loaded != null) {
        if (onProgress) onProgress(Math.round((p.loaded / p.total) * 100));
      } else if (p.status === 'done' && !initFired) {
        initFired = true;
        if (onInit) onInit();
      }
    },
  });

  cachedModel = model;
  cachedModelId = modelId;
  return model;
}

async function decodeBlob(blob) {
  const ab = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  const buf = await ctx.decodeAudioData(ab);
  const audio = buf.getChannelData(0);
  await ctx.close();
  return audio;
}

export async function startMicTranscription(modelId, callbacks) {
  const { onText, onStatus, onProgress, onInit } = callbacks;

  const model = await loadModel(modelId, onProgress, onInit);

  onStatus('マイクへのアクセスを要求中…');
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  isRecording = true;
  onStatus('録音中…');

  const recordChunk = () => {
    if (!isRecording) return;

    const recorder = new MediaRecorder(micStream);
    currentRecorder = recorder;
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      if (chunks.length === 0) {
        if (isRecording) recordChunk();
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType });
      try {
        const audio = await decodeBlob(blob);
        const result = await model(audio, { language: 'japanese', task: 'transcribe' });
        const text = result.text ?? '';
        if (text.trim()) onText(text.trim());
      } catch (err) {
        onStatus(`エラー: ${err.message}`);
      }
      if (isRecording) recordChunk();
    };

    recorder.start();
    setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, 5000);
  };

  recordChunk();
}

export function stopMicTranscription() {
  isRecording = false;
  if (currentRecorder && currentRecorder.state === 'recording') {
    currentRecorder.stop();
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  currentRecorder = null;
}

export async function transcribeFile(file, modelId, callbacks) {
  const { onText, onStatus, onProgress, onInit } = callbacks;

  const model = await loadModel(modelId, onProgress, onInit);

  onStatus('ファイルを解析中…');
  const audio = await decodeBlob(file);

  onStatus('文字起こし中… （ページが一時的に固まります）');
  const result = await model(audio, {
    language: 'japanese',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  const text = result.text ?? '';
  if (text.trim()) onText(text.trim());
  onStatus('完了');
}
