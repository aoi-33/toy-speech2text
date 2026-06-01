/**
 * whisper.js
 * Whisper.js による音声認識処理。
 * 重い ONNX 推論は whisper-worker.js（Web Worker）に委譲する。
 * DOM には一切触れない。
 */

// --- Worker 管理 ---

let worker = null;
let loadResolve = null;
let loadReject = null;
let loadProgressCb = null;
let loadInitCb = null;
let transcribeId = 0;
const pending = new Map(); // id -> { resolve, reject }

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      switch (data.type) {
        case 'progress':
          if (data.phase === 'download') loadProgressCb?.(data.pct);
          if (data.phase === 'init') loadInitCb?.();
          break;
        case 'loaded':
          loadResolve?.();
          loadResolve = loadReject = loadProgressCb = loadInitCb = null;
          break;
        case 'result': {
          const cb = pending.get(data.id);
          if (cb) { pending.delete(data.id); cb.resolve(data.text); }
          break;
        }
        case 'error': {
          if (data.id != null) {
            const cb = pending.get(data.id);
            if (cb) { pending.delete(data.id); cb.reject(new Error(data.message)); }
          } else {
            loadReject?.(new Error(data.message));
            loadResolve = loadReject = loadProgressCb = loadInitCb = null;
          }
          break;
        }
      }
    };
  }
  return worker;
}

// --- マイク録音用の状態 ---

let micStream = null;
let currentRecorder = null;
let isRecording = false;

// --- 公開 API ---

/**
 * 利用可能なデバイスを返す。
 */
export function getDevice() {
  return navigator.gpu ? 'webgpu' : 'wasm';
}

/**
 * Worker にモデルをロードさせる。
 * 既にロード済みなら Worker が即座に loaded を返す。
 */
export async function loadModel(modelId, onProgress, onInit) {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    loadResolve = resolve;
    loadReject = reject;
    loadProgressCb = onProgress ?? null;
    loadInitCb = onInit ?? null;
    w.postMessage({ type: 'load', modelId });
  });
}

/**
 * Blob を 16kHz モノラル Float32Array に変換する（メインスレッド）。
 * AudioContext は Worker では使えないためここで処理する。
 */
async function decodeBlob(blob) {
  const ab = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  const buf = await ctx.decodeAudioData(ab);
  const audio = buf.getChannelData(0);
  await ctx.close();
  return audio;
}

/**
 * Worker で推論を実行し結果テキストを返す。
 * audio バッファはゼロコピー転送する。
 */
function inferInWorker(audio, options) {
  const w = getWorker();
  const id = ++transcribeId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ type: 'transcribe', id, audio, options }, [audio.buffer]);
  });
}

/**
 * マイクからのリアルタイム文字起こしを開始する。
 * 5秒チャンクを繰り返し処理する。
 */
export async function startMicTranscription(modelId, callbacks) {
  const { onText, onStatus } = callbacks;

  onStatus('モデルを読み込み中…', 'loading');
  await loadModel(
    modelId,
    (pct) => onStatus(`モデル読み込み中… ${pct}%`, 'loading'),
    () => onStatus('モデルを初期化中… しばらくお待ちください', 'loading'),
  );

  onStatus('マイクへのアクセスを要求中…', 'loading');
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  isRecording = true;
  onStatus('録音中…', 'recording');

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
        const text = await inferInWorker(audio, { language: 'japanese', task: 'transcribe' });
        if (text.trim()) onText(text.trim());
      } catch (err) {
        onStatus(`エラー: ${err.message}`, 'error');
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
 */
export async function transcribeFile(file, modelId, callbacks) {
  const { onText, onStatus, onProgress } = callbacks;

  onStatus('モデルを読み込み中…', 'loading');
  await loadModel(
    modelId,
    (pct) => {
      if (onProgress) onProgress(Math.round(pct * 0.5));
      onStatus(`モデル読み込み中… ${pct}%`, 'loading');
    },
    () => {
      if (onProgress) onProgress('indeterminate');
      onStatus('モデルを初期化中… しばらくお待ちください', 'loading');
    },
  );

  onStatus('ファイルを解析中…', 'loading');
  const audio = await decodeBlob(file);

  onStatus('文字起こし中…', 'loading');
  if (onProgress) onProgress(50);

  const text = await inferInWorker(audio, {
    language: 'japanese',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  if (onProgress) onProgress(100);
  if (text.trim()) onText(text.trim());
  onStatus('完了', 'done');
}
