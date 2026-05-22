/**
 * whisper.js
 * Whisper.js（@xenova/transformers）による音声認識処理。
 * DOM には一切触れない。
 */

import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js';

// モデルキャッシュ
let cachedModel = null;
let cachedModelId = null;

// マイク録音用の状態
let micStream = null;
let currentRecorder = null;
let isRecording = false;
let chunkQueue = [];

/**
 * 利用可能なデバイスを返す。
 * WebGPU が使えれば 'webgpu'、そうでなければ 'wasm'。
 */
export function getDevice() {
  return navigator.gpu ? 'webgpu' : 'wasm';
}

/**
 * モデルをロードする。
 * 同じ modelId が既にロード済みならキャッシュを返す。
 * @param {string} modelId - Hugging Face のモデル ID
 * @param {(pct: number) => void} [onProgress] - 進捗コールバック（0-100）
 * @returns {Promise<any>} ロードされたパイプライン
 */
export async function loadModel(modelId, onProgress) {
  if (cachedModelId === modelId && cachedModel !== null) {
    return cachedModel;
  }

  const device = getDevice();

  const model = await pipeline('automatic-speech-recognition', modelId, {
    device,
    progress_callback: (progress) => {
      if (onProgress && progress.total > 0 && progress.loaded != null) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        onProgress(pct);
      }
    },
  });

  cachedModel = model;
  cachedModelId = modelId;
  return model;
}

/**
 * Blob を 16kHz モノラル Float32Array に変換して文字起こしする（内部関数）。
 * @param {Blob} blob - 音声データ
 * @param {any} model - ロード済みパイプライン
 * @returns {Promise<string>} 文字起こし結果
 */
async function processBlob(blob, model) {
  const ab = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  const buf = await ctx.decodeAudioData(ab);
  const audio = buf.getChannelData(0);
  await ctx.close();
  const result = await model(audio, { language: 'japanese', task: 'transcribe' });
  return result.text ?? '';
}

/**
 * マイクからのリアルタイム文字起こしを開始する。
 * 5秒チャンクを繰り返し処理する。
 * @param {string} modelId - 使用するモデル ID
 * @param {{ onText: (text: string) => void, onStatus: (text: string, type: string) => void }} callbacks
 */
export async function startMicTranscription(modelId, callbacks) {
  const { onText, onStatus } = callbacks;

  onStatus('モデルを読み込み中…', 'loading');
  const model = await loadModel(modelId, (pct) => {
    onStatus(`モデル読み込み中… ${pct}%`, 'loading');
  });

  onStatus('マイクへのアクセスを要求中…', 'loading');
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  isRecording = true;
  chunkQueue = [];
  onStatus('録音中…', 'recording');

  // 5秒チャンクを繰り返し処理するループ
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
        const text = await processBlob(blob, model);
        if (text.trim()) onText(text.trim());
      } catch (err) {
        onStatus(`エラー: ${err.message}`, 'error');
      }
      // 次のチャンクへ
      if (isRecording) recordChunk();
    };

    recorder.start();
    // 5秒後に停止してチャンクを処理
    setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop();
    }, 5000);
  };

  recordChunk();
}

/**
 * マイクからの文字起こしを停止する。
 */
export function stopMicTranscription() {
  isRecording = false;
  if (currentRecorder && currentRecorder.state === 'recording') {
    currentRecorder.stop();
  }
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }
  currentRecorder = null;
}

/**
 * ファイルを文字起こしする。
 * 長い音声は chunk_length_s=30, stride_length_s=5 で分割処理する。
 * @param {File} file - 音声ファイル
 * @param {string} modelId - 使用するモデル ID
 * @param {{ onText: (text: string) => void, onStatus: (text: string, type: string) => void, onProgress?: (pct: number) => void }} callbacks
 */
export async function transcribeFile(file, modelId, callbacks) {
  const { onText, onStatus, onProgress } = callbacks;

  onStatus('モデルを読み込み中…', 'loading');
  const model = await loadModel(modelId, (pct) => {
    if (onProgress) onProgress(Math.round(pct * 0.5)); // ロードは 0-50% に割り当て
    onStatus(`モデル読み込み中… ${pct}%`, 'loading');
  });

  onStatus('ファイルを解析中…', 'loading');

  const ab = await file.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  const buf = await ctx.decodeAudioData(ab);
  const audio = buf.getChannelData(0);
  await ctx.close();

  onStatus('文字起こし中…', 'loading');
  if (onProgress) onProgress(50);

  const result = await model(audio, {
    language: 'japanese',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  if (onProgress) onProgress(100);

  const text = result.text ?? '';
  if (text.trim()) onText(text.trim());
  onStatus('完了', 'done');
}
