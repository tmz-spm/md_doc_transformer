import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('./', import.meta.url)));
const context = { window: {}, TextEncoder, TextDecoder, Blob, Uint8Array, DataView, Response, DecompressionStream };
runInNewContext(await readFile('engine-offline.js', 'utf8'), context);
const C = context.window.OfflineConverter;
const source = '# 日本語見出し\n\n**太字** と *斜体*\n\n- 項目\n\n---\n';
const blocks = C.mdBlocks(source);
assert.equal(blocks[0].type, 'heading');
assert.match(C.blocksToMarkdown(C.fromTex(C.toTex(blocks))), /日本語見出し/);
assert.equal(blocks.filter(b => b.type === 'hr').length, 1);
assert.equal(C.mdBlocks('# 見出し\n\n普通の段落').some(b => b.type === 'hr'), false);
assert.equal(C.mdBlocks('---\ntitle: 題名\n---\n本文').some(b => b.type === 'hr'), false);
assert.doesNotMatch(C.blocksToMarkdown(C.fromTex('本文 % 非表示\n\n次の段落')), /非表示/);
const files = await C.zipRead(C.zipWrite({ '日本語.txt': '内容', 'media/a.txt': 'asset' }));
assert.equal(new TextDecoder().decode(files['日本語.txt']), '内容');
assert.equal(new TextDecoder().decode(files['media/a.txt']), 'asset');
assert.throws(() => C.normalize('../../outside'), /不正/);
await assert.rejects(() => C.zipRead(new Blob(['broken'])));
const html = await readFile('index.html', 'utf8');
assert.doesNotMatch(html, /type="module"|https?:\/\/|worker\.js|app\.js|\.wasm/);
for (const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) await readFile(match[1]);
for (const name of ['app-offline.js', 'engine-offline.js']) {
  const js = await readFile(name, 'utf8');
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|new WebSocket|new Worker|import\s*\(/);
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
if ((await readdir('.')).includes('dist')) {
  assert.deepEqual((await readdir('dist')).sort(), ['index.html', 'style.css', 'engine-offline.js', 'app-offline.js', 'README.txt', 'SUPPORTED_FEATURES.md', 'AUDIT_REPORT.md', 'NOTICE.txt'].sort());
  for (const name of await readdir('dist')) assert.deepEqual(await readFile(`dist/${name}`), await readFile(name));
}
console.log('PASS: Markdown/TeX, metadata, ZIP, invalid paths, offline assets and distribution');
