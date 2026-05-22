// Web Speech API ラッパー。DOM に触れない。

/** @type {SpeechRecognition | null} */
let recognition = null;

/** 認識が実行中かどうか */
let isRunning = false;

/** 現在登録されているコールバック群 */
let currentCallbacks = null;

/**
 * ブラウザ情報を返す。
 * @returns {{ supported: boolean, browser: 'chrome' | 'safari' | 'other', label: string }}
 */
export function getBrowserInfo() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SpeechRecognition;
  const ua = navigator.userAgent;

  let browser = 'other';
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) {
    browser = 'chrome';
  } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    browser = 'safari';
  }

  const labelMap = {
    chrome: 'Chrome (Google)',
    safari: 'Safari (Apple)',
    other: 'ブラウザ',
  };

  const badgeClassMap = { chrome: 'badge-chrome', safari: 'badge-safari', other: '' };
  return {
    supported,
    browser,
    label: supported ? labelMap[browser] : '非対応',
    badgeClass: supported ? badgeClassMap[browser] : 'badge-error',
  };
}

/**
 * 音声認識を開始する。
 * @param {{ onFinal: (text: string) => void, onInterim: (text: string) => void, onError: (errorCode: string) => void }} callbacks
 */
export function startRecognition(callbacks) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    callbacks.onError('not-supported');
    return;
  }

  // 既存の認識を停止してから新規作成
  if (recognition) {
    isRunning = false;
    recognition.abort();
  }

  currentCallbacks = callbacks;
  isRunning = true;

  recognition = new SpeechRecognition();
  recognition.lang = 'ja-JP';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        currentCallbacks.onFinal(result[0].transcript);
      } else {
        interim += result[0].transcript;
      }
    }
    if (interim) {
      currentCallbacks.onInterim(interim);
    }
  };

  recognition.onerror = (event) => {
    currentCallbacks.onError(event.error);
  };

  // 認識が終了したとき、isRunning が true なら自動で再開（ループ）
  recognition.onend = () => {
    if (isRunning) {
      recognition.start();
    }
  };

  recognition.start();
}

/**
 * 音声認識を停止する。
 */
export function stopRecognition() {
  isRunning = false;
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
  currentCallbacks = null;
}
