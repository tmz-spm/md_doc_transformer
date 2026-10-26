# 文書変換アプリのコード案内

Word・Markdown・TeXをブラウザ内で変換するアプリ。読み取る順番は `index.html` → `app.js` → `worker.js` → `engine.js`。

## 全体の流れ

```text
画面操作 → app.js → worker.js → engine.js → pandoc-core.js → Pandoc
             ↑        │
             └─ 結果 ─┘
```

Pandocが文書を変換する。アプリ側は入力の受け渡し、変換設定、結果の表示・保存を担当する。

```text
入力文書 → 共通の文書データ（JSON）→ Word / Markdown / TeX
                                  └→ HTMLプレビュー
```

見出し・段落・数式などを共通データにするので、形式の組み合わせごとに変換処理を書く必要がない。

## index.html — 画面の部品

入力・出力の選択欄、入力用の `textarea`、プレビュー、各ボタンを定義する。

- `id="convert"`：JavaScriptが変換ボタンを探すための名前。
- `hidden`：初期状態で非表示にする。
- `details`：オプションの折りたたみ。
- `dialog`：対応表の小窓。
- 最後の `script type="module"`：`app.js` を読み込む。

HTMLだけでは変換しない。ボタンを押した後の処理は `app.js` にある。

## style.css — 見た目と配置

`.workspace` で入力と結果を左右に並べ、`.document` でプレビューの見出し・表・コードを整える。

| 書き方 | このコードでの用途 |
| --- | --- |
| `:root` の `--accent` など | 色の共通設定 |
| `.クラス名` | 同じ役割の要素を装飾 |
| `#id名` | 特定の要素を装飾 |
| `:disabled` | 押せないボタンの表示 |
| `@media` | 画面幅に応じた配置変更 |

650px以下では左右の欄を縦に並べる。数式自体の見た目はKaTeXのCSSも使う。

## app.js — 操作、表示、保存

`$()` は `document.getElementById()` の短縮形。たとえば `$("editor").value` で入力欄の文字を取得する。

### 保持するデータ

| 変数 | 内容 |
| --- | --- |
| `inputFile` | 読み込んだWordファイル |
| `resources` / `reference` | 関連画像など / Wordのスタイル参照ファイル |
| `result` / `resultTo` | 変換結果 / 結果の形式 |
| `worker` | 別処理で動く変換担当 |
| `isReady` / `busy` | エンジン準備済みか / 変換中か |
| `urls` / `timer` | プレビュー画像の一時URL / タイムアウトの管理番号 |

### 主な関数

| 関数 | 処理 |
| --- | --- |
| `startWorker()` | Workerを起動し、準備完了・結果・エラーを受け取る |
| `importFile()` | 拡張子と容量を確認。Wordはファイル、MD・TeXは文字として保持 |
| `convert()` | 空入力を確認し、入力と設定をWorkerへ送る |
| `setBusy()` | 変換中の編集や二重操作を防ぐ |
| `renderResult()` | HTML、数式、画像、警告を表示する |
| `invalidate()` | 入力変更などで古くなった結果を無効にする |
| `releasePreviewUrls()` | 不要になった画像の一時URLを解放する |
| `updateInput()` / `showTab()` | 入力形式や選択タブに合わせて表示を切り替える |
| `safePath()` | 関連ファイルの絶対パスや `..` などを拒否する |
| `save()` | ファイルの一時URLを作り、ダウンロードを開始する |

`renderResult()` はDOMPurifyでHTMLを検査してから画面に挿入する。数式はKaTeXで描画し、画像は読み込んだファイルに対応づける。

末尾の `onclick`・`onchange` などは「操作が起きたら呼ぶ処理」の登録。

- 入れ替え：変換結果を次の入力にする。
- ダウンロード：MD・TeXに関連ファイルがあればZIPにまとめる。
- キャンセル：Workerを終了し、起動し直す。
- タイムアウト：90秒でWorkerを終了する。

`Blob` はファイル相当のデータ、`async` / `await` は読み込みなどの完了を待つ書き方。

## worker.js — 変換専用の処理

Web Workerは画面とは別に処理を実行する仕組み。重い変換中も画面を操作できる。

1. `init()` が圧縮された `pandoc.wasm.gz` を読み込み、解凍する。
2. `createPandocInstance()` で変換エンジンを準備する。
3. 入力を受信したら、準備完了を待って `transform()` を呼ぶ。
4. `postMessage()` で `ready`・`result`・`error` を画面側に返す。

`fetch()` の対象はエンジンのファイル。入力文書をサーバーへ送る処理ではない。

## engine.js — 変換手順と設定

入口は `transform(convert, job)`。`convert` はPandocを呼ぶ関数、`job` は入力・出力形式や文書などの設定。

1. 入力を共通の文書データへ変換する。Wordは `source.docx` として渡す。
2. JSONを読み取り、画像や独自命令について注意事項を集める。
3. 出力形式を設定する。TeXは日本語向けの `ltjsarticle` とLuaLaTeXを指定する。
4. 共通データから指定形式のファイルを生成する。
5. 同じ共通データからHTMLプレビューを生成する。
6. ファイル、文字列、HTML、画像、警告をまとめて返す。

`MARKDOWN` と `MD_OUT` はMarkdownの読み書きに使う設定。`+` は機能の有効化、`-` は無効化を表す。

`inspect()` は文書データの中を再帰的に調べる関数。「中にデータがあれば同じ関数で調べる」を繰り返す。

**数式の変換はPandoc、画面表示はKaTeXの担当。** Word出力の数式は画像ではなくOMMLという編集可能な形式になる。プレビューはWordファイルを開いた結果ではない。

## pandoc-core.js — JavaScriptとPandocの橋渡し

`pandoc-wasm` 由来のコード。実際の変換プログラムは `pandoc.wasm` に入っている。WebAssembly（WASM）はブラウザで実行できるプログラム形式。

| 処理 | 役割 |
| --- | --- |
| `createPandocInstance()` | WASMと実行環境を初期化する |
| `addFile()` | 文書や画像をメモリ内の仮想ファイルにする |
| `convert()` | 設定と入力を渡し、出力ファイル・警告を回収する |
| `collectNewFiles()` | サブフォルダもたどり、抽出された画像を集める |
| `query()` | 対応形式などを問い合わせる |
| `pandoc()` | 古い呼び出し方との互換処理。アプリ本体では使わない |

このアプリでは `addFile()` を修正した。`media/image.png` を単なる名前として登録せず、`media` フォルダと `image.png` に分けて配置する。これで抽出した画像を再変換時にも読める。

`malloc` や `TextEncoder` が出てくる部分は、文字列をWASM側のメモリへ渡す処理。

## build.mjs — 配信用ファイルを作る

`pnpm build` から実行する。

1. esbuildで `app.js` と `worker.js` の依存コードをまとめ、小さくする。
2. HTML、CSS、数式用フォント、ライセンス表示を `dist/` にコピーする。
3. PandocのWASMをgzip圧縮して `dist/` に保存する。

`dist/` は生成物。修正するのは元のソースで、修正後に再ビルドする。

## serve.mjs — 手元で画面を確認する

`node serve.mjs` で起動。`127.0.0.1:4173` への要求に対して `dist/` のファイルを返す。

- フォルダへの要求には `index.html` を返す。
- 拡張子に応じてHTML・JavaScriptなどの種類を伝える。
- 読めない場合は `404` を返す。

ローカル確認用の簡易サーバー。文書変換はここでは実行しない。

## test.mjs — 変換結果を確かめる

`pnpm test` から実行。`assert` は期待と違ったらテストを失敗させる命令。

6方向の変換、見出し、分数・平方根、表、リンク、脚注、画像の往復、壊れたWordの拒否を確認する。`.docx` はZIP形式なので、展開して内部のXMLに見出しスタイルや数式要素があるかも調べる。

`test-output/` には確認用のWord・Markdown・TeXを保存する。ブラウザの見た目を検査するテストではない。

## 設定・補助ファイル

| ファイル | 役割 |
| --- | --- |
| `package.json` | 使用ライブラリと `build`・`test` コマンドの定義 |
| `pnpm-lock.yaml` | 導入するライブラリの具体的なバージョンを固定 |
| `pnpm-workspace.yaml` | esbuildの導入時処理を許可し、実行前の依存確認を設定 |
| `.gitignore` | 依存ライブラリ・生成物・テスト出力をGit管理から除外 |
| `.openai/hosting.json` | Sitesの公開先と配信フォルダ。公開用ソース一式には含めない |
| `README.md` | 起動方法と対応範囲 |
| `NOTICE.txt` / `PANDOC-WRAPPER-LICENSE.txt` | 使用ライブラリとライセンスの表示 |

## 変更箇所の目安

文言・部品は `index.html`、色・配置は `style.css`、操作は `app.js`、変換設定は `engine.js`。`pandoc-core.js` はエンジン連携の修正が必要な場合に読む。
