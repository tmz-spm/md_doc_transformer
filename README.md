# 文書変換 — 完全オフライン・簡易版

Word（.docx）・Markdown・TeXをブラウザ内で相互変換します。共有相談の点検済み `document-converter-offline-audited.zip` を基準にした、ブラウザ用JavaScript版です。数式ライブラリはローカルに同梱しています。入力文書を外部へ送信しません。

## 起動

リポジトリのZIPを「すべて展開」し、`index.html` をChromeまたはEdgeで開きます。「準備完了」と表示されたら利用できます。インストール・ビルド・ネット接続・ローカルサーバーは不要です。Wordの圧縮ファイルを読む場合は `DecompressionStream('deflate-raw')` 対応ブラウザが必要です。

1. 入力と出力の形式を選び、ソースを入力するかファイルを開きます。
2. Markdown・TeXは入力から約90ms後にプレビューを更新します。ソース欄のTabで入力プレビューへ、もう一度Tabでソースへ戻ります。タブのクリックにも対応しています。
3. 保存用ファイルを作るときは「変換」を押し、「ダウンロード」で保存します。ライブプレビューだけではファイルは作られません。

## 対応と制限

見出し、段落、基本の文字装飾、単層リスト、引用、コード、簡単な表、リンク、水平線、関連ファイルで渡した画像に対応します。変換後プレビューは出力を読み直して表示します。元にない罫線や表の見出しなどを追加しないための修正を含みます。

詳細は [SUPPORTED_FEATURES.md](SUPPORTED_FEATURES.md)、点検内容は [AUDIT_REPORT.md](AUDIT_REPORT.md)、操作説明は [README.txt](README.txt) を参照してください。監査報告書の検証記録はZIP作成時点の記録です。

**以前のPandoc版とは対応範囲が異なります。** 脚注、入れ子リスト、結合セル、段組み、改ページや複雑な組版は再現できません。数式は下記の範囲でOMMLに対応しています。特殊な数式や独自マクロには制限があります。Word参照スタイルは未対応で、画面でも無効になっています。旧形式 `.doc` も対象外です。

## 開発・検証（任意）

アプリの利用にはNode.jsは不要です。開発用スクリプトだけNode.js 22以降を使います。配布ファイルをコピーする通常のビルドはインストール不要です。数式ライブラリを更新する場合だけ `npm ci` → `npm run vendor:math` を実行してください（バージョンはpackage-lock.jsonで固定）。

- `npm ci` → `node test.mjs`：Markdown・TeX・ZIP・OMML数式・配布構成の回帰テスト。
- `node build.mjs`：アプリファイルと `vendor/` を `dist/` にコピー。`dist/index.html` も直接開けます。
- `node serve.mjs`：`dist/` を `http://127.0.0.1:4173` で配信。
- `node serve.mjs .` → `http://127.0.0.1:4173/tests/browser.html`：ブラウザで6方向変換、Word往復、画像、監査項目、UIのTab切替・ライブ更新を検証。`tests/browser.html` の直接起動も可能です。

構成と変更箇所は [CODE_GUIDE.md](CODE_GUIDE.md) を参照してください。Pandoc/WASM・Workerは使いません。実行時に外部サーバーからライブラリを取得しません。旧実装はGit履歴に残っています。

## JavaScriptだけでの数式処理

- KaTeXで行内 `$...$` と別行 `$$...$$` の数式をリアルタイム描画します。TeX入力では `\(...\)`、`\[...\]`、`equation`・`align`・`gather` 環境も読み取ります。数式の自動番号付け・参照は対象外です。
- 分数、平方根、上下の添字、ギリシャ文字、積分、総和、行列、基本的な連立式をWordの編集可能なOMML数式として出力します。Wordから読み戻すときも数式構造をTeXへ変換します。
- `KaTeX → MathML → mathml2omml` でWordへ、`omml2mathml → mathml-to-latex` でWordから変換します。すべてJavaScriptで処理し、WASM・Pandoc・Python・外部変換サービスは使いません。
- コード内やエスケープされた記号は数式として解釈しません。構文エラー・未対応コマンドでは元のTeXを表示し、Word変換に失敗した場合はテキストとして保存して注意を出します。Wordから数式構造を読み取れなければ、取得できた文字と注意を残します。
- すべての数式や装飾の完全な往復再現は保証しません。元のTeXの空白・マクロ表現やWord固有の細かな設定は変わる場合があります。Word本体での表示・編集は未検証です。
- `vendor/` にはJS・CSS・フォント・ライセンス・LGPL変換器の未圧縮ソースを同梱しています。詳細は [NOTICE.txt](NOTICE.txt) と [vendor/README.md](vendor/README.md) を参照してください。
