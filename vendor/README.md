# 同梱するJavaScript数式ライブラリ

| 用途 | ライブラリ | 元ソース |
| --- | --- | --- |
| 数式描画・TeXからMathML | KaTeX 0.19.1 | https://github.com/KaTeX/KaTeX |
| MathMLからWord OMML | mathml2omml 0.5.0 | https://github.com/fiduswriter/mathml2omml |
| Word OMMLからMathML | omml2mathml 1.3.0 | https://github.com/scienceai/omml2mathml |
| MathMLからTeX | mathml-to-latex 1.8.0 | https://github.com/asnunes/mathml-to-latex |

依存を含めたバージョン・ライセンスはmanifest.json、ライセンス本文はlicenses/にあります。
mathml2ommlの未圧縮モジュールはsources/に同梱します（モジュール本体は改変なし）。
GPL-3.0本文もLGPLと共に含めています。

このディレクトリはリポジトリと配布ZIPに含めるため、利用時のインストール・ネット接続・ビルドは不要です。ライブラリのコードを変更する場合は、リポジトリのmath-support.js、scripts/vendor-math.mjs、package.jsonとpackage-lock.jsonを使用し、npm ci → npm run vendor:mathで再生成できます。エンジンとは別のスクリプトとして読み込みます。

get-domは上流のNode用実装を使用せず、scripts/browser-domの独自アダプターに置き換えています。
CSSの参照フォントもfonts/へ同梱しています。

元ソースと再生成用スクリプトのリポジトリ: https://github.com/tmz-spm/md_doc_transformer
XPathはAPI互換の0.0.34（MIT）を使用します。
