# 文書変換 — 完全オフライン・簡易版

Word（.docx）・Markdown・TeXをブラウザ内で相互変換します。共有相談の点検済み `document-converter-offline-audited.zip` を基準にした、外部依存のないJavaScript版です。入力文書を外部へ送信しません。

## 起動

リポジトリのZIPを「すべて展開」し、`index.html` をChromeまたはEdgeで開きます。「準備完了 — Node.js不要・完全オフライン」と表示されたら利用できます。インストール・ビルド・ネット接続・ローカルサーバーは不要です。Wordの圧縮ファイルを読む場合は `DecompressionStream('deflate-raw')` 対応ブラウザが必要です。

1. 入力と出力の形式を選び、ソースを入力するかファイルを開きます。
2. Markdown・TeXは入力から約90ms後にプレビューを更新します。ソース欄のTabで入力プレビューへ、もう一度Tabでソースへ戻ります。タブのクリックにも対応しています。
3. 保存用ファイルを作るときは「変換」を押し、「ダウンロード」で保存します。ライブプレビューだけではファイルは作られません。

## 対応と制限

見出し、段落、基本の文字装飾、単層リスト、引用、コード、簡単な表、リンク、水平線、関連ファイルで渡した画像に対応します。変換後プレビューは出力を読み直して表示します。元にない罫線や表の見出しなどを追加しないための修正を含みます。

詳細は [SUPPORTED_FEATURES.md](SUPPORTED_FEATURES.md)、点検内容は [AUDIT_REPORT.md](AUDIT_REPORT.md)、操作説明は [README.txt](README.txt) を参照してください。監査報告書の検証記録はZIP作成時点の記録です。

**以前のPandoc版とは対応範囲が異なります。** Wordの編集可能な数式（OMML）、脚注、入れ子リスト、結合セル、段組み、改ページや複雑な組版は再現できません。数式は主に文字列として扱い、既存Word数式が失われる場合があります。Word参照スタイルは未対応で、画面でも無効になっています。旧形式 `.doc` も対象外です。

## 開発・検証（任意）

アプリの利用にはNode.jsは不要です。開発用スクリプトだけNode.js 22以降を使います。依存パッケージのインストールは不要です。

- `node test.mjs`：Markdown・TeX・ZIPと配布構成の回帰テスト。
- `node build.mjs`：8つの配布ファイルだけを `dist/` にコピー。`dist/index.html` も直接開けます。
- `node serve.mjs`：`dist/` を `http://127.0.0.1:4173` で配信。
- `node serve.mjs .` → `http://127.0.0.1:4173/tests/browser.html`：ブラウザで6方向変換、Word往復、画像、監査項目、UIのTab切替・ライブ更新を検証。`tests/browser.html` の直接起動も可能です。

構成と変更箇所は [CODE_GUIDE.md](CODE_GUIDE.md) を参照してください。Pandoc/WASM・Worker・外部ライブラリと旧ロックファイルはこの版では使いません。旧実装はGit履歴に残っています。
