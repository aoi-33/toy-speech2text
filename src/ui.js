// DOM 操作・ステータス・結果表示の一元管理。

// --- DOM 要素の取得（初回アクセス時にキャッシュ） ---

/** @returns {HTMLElement} */
const el = (id) => document.getElementById(id);

/**
 * ステータス表示を更新する。
 * @param {string} text
 * @param {'idle' | 'recording' | 'loading' | 'done' | 'error'} type
 */
export function setStatus(text, type) {
  const bar = document.querySelector('.status-bar');
  const label = el('status-text');

  // 既存の status-* クラスをすべて除去
  [...bar.classList].forEach((cls) => {
    if (cls.startsWith('status-')) bar.classList.remove(cls);
  });

  bar.classList.add(`status-${type}`);
  label.textContent = text;
}

/**
 * プログレスバーを更新する。null を渡すと非表示。
 * @param {number | null} pct
 */
export function setProgress(pct) {
  const bar = el('progress-bar');
  const fill = el('progress-fill');

  if (pct === null) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
  fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
}

/**
 * 結果エリアに段落を追記し、末尾までスクロールする。
 * @param {string} text
 */
export function appendResult(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  const result = el('result');
  const p = document.createElement('p');
  p.textContent = trimmed;
  result.appendChild(p);
  result.scrollTop = result.scrollHeight;
}

/**
 * 結果エリアをクリアする。
 */
export function clearResult() {
  el('result').innerHTML = '';
}

/**
 * 仮認識テキスト（interim）を更新する。
 * @param {string} text
 */
export function setInterim(text) {
  el('interim').textContent = text;
}

/**
 * 現在の結果エリアのテキストを返す。
 * @returns {string}
 */
export function getResultText() {
  return el('result').innerText.trim();
}
