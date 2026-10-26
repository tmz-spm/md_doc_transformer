# 文書変換アプリのコード案内

この版は `document-converter-offline-audited.zip` の8ファイルを基準とします。ビルドしなくても `index.html` を直接開けます。

```text
index.html → engine-offline.js → window.OfflineConverter
           → app-offline.js   → 入力・プレビュー・変換・保存
           → style.css
```

| ファイル | 役割 |
| --- | --- |
| `index.html` | 入出力形式、ソース・プレビュータブ、操作ボタン、対応表ダイアログ |
| `style.css` | レイアウトと表示。明示していない見出し下線・引用線・表罫線を足さない |
| `engine-offline.js` | Markdown/TeXの解析・出力、ZIPとOOXMLの読み書き、安全なDOM生成によるプレビュー |
| `app-offline.js` | 入力、約90msのライブ更新、Tab切替、結果の無効化、関連画像、変換・保存 |
| `SUPPORTED_FEATURES.md` | 対応・部分対応・未対応の一覧 |
| `AUDIT_REPORT.md` | ZIP作成時の監査記録と残る制約 |
| `README.txt` / `NOTICE.txt` | 配布ZIPに含める操作説明と使用技術の説明 |
| `build.mjs` | 固定の8ファイルを空にした `dist/` へコピー。WASM等の旧生成物も残さない |
| `serve.mjs` | 任意の手元確認用HTTPサーバー。既定は `dist/`、引数 `.` でソースを配信 |
| `test.mjs` | Node.js組み込み機能だけで実行する構成・解析・ZIPテスト |
| `tests/browser.html` / `tests/browser.js` | ブラウザのXML/DOM/ZIP APIと実際のUIによる回帰テスト |

## 変換の流れ

`mdBlocks()` / `fromTex()` / `docxRead()` で共通のブロック配列へ読み取り、`blocksToMarkdown()` / `toTex()` / `buildDocx()` で出力します。Wordは独自のZIP読み書きとOOXML解析で処理し、圧縮ZIPの展開にはブラウザの `DecompressionStream` を使います。

`preview()` はDOM要素と `textContent` でプレビューを作り、任意のHTMLを実行しません。関連画像はユーザーが渡したファイルのBlob URLで表示します。変換後の結果はシリアライズ済みの出力を再解析して表示します。

## 編集箇所の目安

操作は `app-offline.js`、構文・変換結果は `engine-offline.js`、画面は `index.html` と `style.css` を編集します。対応範囲を変えた場合は対応表とREADMEも更新し、Nodeテストとブラウザテストを実行してください。WordのOMMLや脚注を完全に保持する実装ではありません。
