/**
 * main.js
 * エントリーポイント。各モジュールを束ねて UI のイベントを配線する。
 */

import { getBrowserInfo, startRecognition, stopRecognition } from './webspeech.js';
import { getDevice, loadModel, startMicTranscription, stopMicTranscription, transcribeFile } from './whisper.js';
import { setStatus, setProgress, appendResult, clearResult, setInterim, getResultText } from './ui.js';
import { isModelCached, deleteModelCache, getApproxSize } from './model-cache.js';

// アプリ状態
let currentEngine = 'webspeech'; // 'webspeech' | 'whisper'
let isRecording = false;
let selectedFile = null;

// DOM 要素
const micCacheInfo = document.getElementById('mic-cache-info');
const fileCacheInfo = document.getElementById('file-cache-info');
const webspeechBtn = document.getElementById('webspeech-btn');
const whisperMicBtn = document.getElementById('whisper-mic-btn');
const fileBtn = document.getElementById('file-btn');
const micModelSelect = document.getElementById('mic-model');
const fileModelSelect = document.getElementById('file-model');
const fileNameEl = document.getElementById('file-name');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const copyBtn = document.getElementById('copy-btn');
const clearBtn = document.getElementById('clear-btn');
const webspeechBadge = document.getElementById('webspeech-badge');
const whisperBadge = document.getElementById('whisper-badge');
const deviceBadge = document.getElementById('device-badge');
const fileDeviceBadge = document.getElementById('file-device-badge');
const webspeechCtrl = document.getElementById('webspeech-ctrl');
const whisperMicCtrl = document.getElementById('whisper-mic-ctrl');

/**
 * キャッシュ情報 UI を更新する。
 * @param {HTMLSelectElement} select - モデル選択 select 要素
 * @param {HTMLElement} infoEl - 表示先要素
 */
async function updateCacheInfo(select, infoEl) {
  const modelId = select.value;
  const size = getApproxSize(modelId);
  const cached = await isModelCached(modelId);

  infoEl.textContent = '';

  const badge = document.createElement('span');
  badge.className = cached ? 'cache-badge cache-badge--hit' : 'cache-badge cache-badge--miss';
  badge.textContent = cached ? 'キャッシュ済み' : '未ダウンロード';
  infoEl.appendChild(badge);

  const sizeSpan = document.createElement('span');
  sizeSpan.className = 'cache-size';
  sizeSpan.textContent = size;
  infoEl.appendChild(sizeSpan);

  if (cached) {
    const btn = document.createElement('button');
    btn.className = 'cache-delete-btn';
    btn.textContent = '削除';
    btn.addEventListener('click', async () => {
      await deleteModelCache(modelId);
      updateCacheInfo(select, infoEl);
    });
    infoEl.appendChild(btn);
  }
}

/**
 * Web Speech API を使って録音を開始する。
 */
function startWebSpeech() {
  isRecording = true;
  webspeechBtn.textContent = '⏹ 停止';
  webspeechBtn.classList.add('recording');
  setStatus('録音中…', 'recording');
  startRecognition({
    onFinal: (text) => appendResult(text),
    onInterim: (text) => setInterim(text),
    onError: (code) => {
      setStatus(`エラー: ${code}`, 'error');
      stopWebSpeech();
    },
  });
}

/**
 * Web Speech API の録音を停止する。
 */
function stopWebSpeech() {
  isRecording = false;
  stopRecognition();
  setInterim('');
  webspeechBtn.textContent = '🎤 録音開始';
  webspeechBtn.classList.remove('recording');
  setStatus('完了', 'done');
}

/**
 * Web Speech の録音状態をトグルする。
 */
function toggleWebSpeech() {
  if (isRecording) {
    stopWebSpeech();
  } else {
    startWebSpeech();
  }
}

/**
 * Whisper マイク録音を開始する。
 */
async function startWhisperMicUI() {
  const modelId = micModelSelect.value;
  isRecording = true;
  whisperMicBtn.textContent = '⏹ 停止';
  whisperMicBtn.classList.add('recording');
  await startMicTranscription(modelId, {
    onText: (text) => appendResult(text),
    onStatus: (text, type) => setStatus(text, type),
  });
  if (micModelSelect && micCacheInfo) updateCacheInfo(micModelSelect, micCacheInfo);
}

/**
 * Whisper マイク録音を停止する。
 */
function stopWhisperMicUI() {
  isRecording = false;
  stopMicTranscription();
  whisperMicBtn.textContent = '🎤 録音開始';
  whisperMicBtn.classList.remove('recording');
  setStatus('完了', 'done');
}

/**
 * Whisper マイクの録音状態をトグルする。
 */
function toggleWhisperMic() {
  if (isRecording) {
    stopWhisperMicUI();
  } else {
    startWhisperMicUI();
  }
}

/**
 * ファイルの文字起こしを実行する。
 */
async function runFileTranscription() {
  if (!selectedFile) return;
  fileBtn.disabled = true;
  const modelId = fileModelSelect.value;
  await transcribeFile(selectedFile, modelId, {
    onText: (text) => appendResult(text),
    onStatus: (text, type) => setStatus(text, type),
    onProgress: (pct) => setProgress(pct),
  });
  setProgress(null);
  fileBtn.disabled = false;
  if (fileModelSelect && fileCacheInfo) updateCacheInfo(fileModelSelect, fileCacheInfo);
}

/**
 * 選択されたファイルをセットする。
 * @param {File} file
 */
function setFile(file) {
  selectedFile = file;
  fileNameEl.textContent = `📄 ${file.name}`;
  fileBtn.disabled = false;
}

/**
 * 初期化処理。
 */
function init() {
  // ブラウザ情報バッジを設定
  const browserInfo = getBrowserInfo();
  webspeechBadge.textContent = browserInfo.label;
  webspeechBadge.className = '';
  webspeechBadge.classList.add(browserInfo.badgeClass);

  // Web Speech 非対応なら webspeech エンジンボタンを無効化して whisper に切り替え
  const webspeechEngineBtn = document.querySelector('.engine-btn[data-engine="webspeech"]');
  if (!browserInfo.supported) {
    if (webspeechEngineBtn) webspeechEngineBtn.disabled = true;
    switchEngine('whisper');
  }

  // デバイスバッジを設定
  const device = getDevice();
  const deviceLabel = device === 'webgpu' ? 'WebGPU' : 'WASM';
  if (deviceBadge) deviceBadge.textContent = deviceLabel;
  if (fileDeviceBadge) fileDeviceBadge.textContent = deviceLabel;
  if (whisperBadge) whisperBadge.textContent = deviceLabel;

  // タブ切り替え
  document.querySelectorAll('.tab[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      document.querySelectorAll('.tab[data-tab]').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active'));
      const targetPanel = document.getElementById(`${targetTab}-panel`);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // エンジン切り替え
  document.querySelectorAll('.engine-btn[data-engine]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      switchEngine(btn.dataset.engine);
    });
  });

  // キャッシュ情報の初期表示とモデル切り替え時の更新
  if (micModelSelect && micCacheInfo) {
    updateCacheInfo(micModelSelect, micCacheInfo);
    micModelSelect.addEventListener('change', () => updateCacheInfo(micModelSelect, micCacheInfo));
  }
  if (fileModelSelect && fileCacheInfo) {
    updateCacheInfo(fileModelSelect, fileCacheInfo);
    fileModelSelect.addEventListener('change', () => updateCacheInfo(fileModelSelect, fileCacheInfo));
  }

  // 各ボタンのイベント
  if (webspeechBtn) webspeechBtn.addEventListener('click', toggleWebSpeech);
  if (whisperMicBtn) whisperMicBtn.addEventListener('click', toggleWhisperMic);
  if (fileBtn) fileBtn.addEventListener('click', runFileTranscription);

  // ファイル選択
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) setFile(fileInput.files[0]);
    });
  }

  // ドラッグ & ドロップ
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('over');
      const file = e.dataTransfer.files[0];
      if (file) setFile(file);
    });
  }

  // コピー・クリア
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(getResultText());
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => clearResult());
  }
}

/**
 * エンジンを切り替える。
 * @param {'webspeech' | 'whisper'} engine
 */
function switchEngine(engine) {
  currentEngine = engine;

  document.querySelectorAll('.engine-btn[data-engine]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.engine === engine);
  });

  if (webspeechCtrl) webspeechCtrl.hidden = engine !== 'webspeech';
  if (whisperMicCtrl) whisperMicCtrl.hidden = engine !== 'whisper';
}

// 初期化実行
init();
