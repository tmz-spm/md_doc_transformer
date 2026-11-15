import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('./', import.meta.url);
const dist = new URL('dist/', root);
const read = (path) => readFile(new URL(path, root), 'utf8');
const write = (path, content) => writeFile(new URL(path, dist), content);

const html = (await read('index.html')).replace(
  '<a href="./SUPPORTED_FEATURES.md" target="_blank" rel="noopener">詳細な対応表（Markdownファイル）</a>も同梱しています。',
  '<a href="./README.md" target="_blank" rel="noopener">README</a>に操作方法と対応範囲をまとめています。',
);
if (!html.includes('href="./README.md"')) throw new Error('Missing distribution README link');

const katexCss = await read('vendor/katex.min.css');
const fontFaces = [...katexCss.matchAll(/@font-face\{[^}]*\}/g)];
if (!fontFaces.length) throw new Error('KaTeX CSS has no font declarations');
let compactCss = katexCss;
for (const [face] of fontFaces) {
  const path = face.match(/src:url\((fonts\/[^()]+\.woff2)\) format\("woff2"\)/)?.[1];
  if (!path) throw new Error('KaTeX font declaration has no leading WOFF2 source');
  const font = await readFile(new URL('vendor/' + path, root));
  if (font.toString('ascii', 0, 4) !== 'wOF2') throw new Error('Invalid WOFF2 file: ' + path);
  const embeddedSource = 'src:url("data:font/woff2;base64,' + font.toString('base64') + '") format("woff2")';
  compactCss = compactCss.replace(face, () => face.replace(/src:[^;}]+/, () => embeddedSource));
}
if (/url\(fonts\//.test(compactCss)) throw new Error('KaTeX CSS still references external font files');

const licenses = await readdir(new URL('vendor/licenses/', root));
const noticeHeader = (await read('NOTICE.txt')).replace(
  '間接依存を含めたバージョンはvendor/manifest.json、ライセンス本文はvendor/licenses/、',
  '間接依存を含めたバージョンとライセンス本文はこのファイルの下部、',
);
const notice = [
  noticeHeader.trimEnd(),
  'KaTeXのCSSでは同梱WOFF2フォントを埋め込み、外部フォントの参照を省いています。',
  '再生成手順 https://github.com/tmz-spm/md_doc_transformer#開発検証任意',
  'パッケージ一覧\n\n' + (await read('vendor/manifest.json')).trimEnd(),
  ...await Promise.all(licenses.sort().map(async name => name + '\n\n' + (await read('vendor/licenses/' + name)).trimEnd())),
].join('\n\n') + '\n';

// Only remove this script's fixed output directory.
await rm(dist, { recursive: true, force: true });
await mkdir(new URL('vendor/sources/', dist), { recursive: true });
const copiedFiles = [
  'style.css', 'engine-offline.js', 'app-offline.js',
  'vendor/math-libraries.js', 'vendor/sources/mathml2omml.js',
];
await Promise.all([
  ...copiedFiles.map(path => cp(new URL(path, root), new URL(path, dist))),
  write('index.html', html),
  write('README.md', await read('docs/distribution-readme.md')),
  write('NOTICE.txt', notice),
  write('vendor/katex.min.css', compactCss),
]);
console.log('Built compact offline converter: ' + fileURLToPath(dist));
