# 文書変換

Word（.docx）・Markdown・TeXをブラウザ内で相互変換する静的Webアプリです。入力文書はサーバーへ送信しません。

コードの役割と処理の流れは [CODE_GUIDE.md](CODE_GUIDE.md) を参照してください。

## 実行

Node.js 22以降とpnpm 11.25.0で、`pnpm install` → `pnpm build` → `node serve.mjs` を実行します。`http://127.0.0.1:4173` を開いてください。生成した `dist/` は通常の静的ホスティングでも配信できます。gzipファイルはそのまま配信し、サーバー側で自動解凍しないでください。

`pnpm test` で6方向の変換、Wordの見出しスタイル、編集可能な数式（OMML）、表、リンク、脚注、画像の往復、壊れたWordファイルの拒否を確認します。

## 対応

- 見出し1～6、太字、斜体、取り消し線、箇条書き、番号付きリスト、チェックリスト
- 引用、コード、表、リンク、画像、脚注、水平線
- `$...$` の行内数式と `$$...$$` の別行立て数式。WordではOMMLの数式になります。
- Wordスタイルの参照ファイル、画像などの関連ファイル、関連ファイル入りZIP
- 日本語のTeX出力はLuaLaTeX / ltjsarticle。TeX本文だけの出力も選択可能

Wordの紙面、任意のマクロ、複雑な組版を完全に往復再現するものではありません。プレビューは入力文書の構造をHTMLで表示し、Wordの改ページは再現しません。Wordを経由するとコード言語などの形式固有情報が失われることがあります。旧Wordの `.doc` は対象外です。

変換エンジン: Pandoc 3.10 / pandoc-wasm 1.1.0。初回に圧縮済みエンジン約16.3 MBを読み込みます。WebAssembly、Web Workers、DecompressionStreamに対応したブラウザが必要です。

`pandoc-core.js` はpandoc-wasmのラッパーから派生し、関連画像のフォルダパスをWASI仮想ファイルシステムに正しく登録する修正を加えています。原著作権表示は `PANDOC-WRAPPER-LICENSE.txt`、依存ライブラリは `NOTICE.txt` を参照してください。
