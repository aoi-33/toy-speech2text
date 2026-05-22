# speech2text

音声文字起こしエンジンをブラウザで比較するデモサイト。ビルド不要・サーバー不要。

## 機能

| 入力 | エンジン | 処理場所 |
|------|---------|---------|
| マイク（リアルタイム）| Web Speech API | Chrome → Google / Safari → Apple のサーバー |
| マイク（チャンク処理）| Whisper.js | ローカル（WebGPU 対応） |
| 音声・動画ファイル | Whisper.js のみ | ローカル |

## 使い方

1. `index.html` をブラウザで開く（Chrome または Safari 推奨）
2. **マイク**タブ：エンジンを選んで「録音開始」
3. **ファイル**タブ：音声・動画ファイルをドロップ → 「文字起こし開始」

対応ファイル形式：mp3 / wav / m4a / mp4 / mov / webm など

## ファイル構成

```
speech2text/
  index.html        ← UI 骨格
  style.css         ← スタイル
  src/
    main.js         ← エントリーポイント（モジュール統合・イベント配線）
    ui.js           ← DOM 操作・ステータス・結果表示
    webspeech.js    ← Web Speech API ラッパー
    whisper.js      ← Whisper.js（マイクチャンク + ファイル処理）
  README.md
```

## デプロイ（GitHub Pages）

リポジトリに `speech2text/` ごとプッシュし、Settings → Pages → Source を `/(root)` に設定する。

アクセス URL：`https://<username>.github.io/<repo>/speech2text/`

## 技術仕様

- **Web Speech API**：ブラウザ組み込み。音声データは外部サーバーへ送信される
- **Whisper.js**：`@xenova/transformers@2` を CDN から読み込みブラウザ内で推論。WebGPU があれば GPU を使用、なければ WASM（CPU）にフォールバック
- モデルは初回ロード時に Hugging Face から自動ダウンロード（tiny: 約75MB、small: 約250MB）
