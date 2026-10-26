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
assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['katex','mathml2omml','omml2mathml','mathml-to-latex'].sort());
if ((await readdir('.')).includes('dist')) {
  assert.deepEqual((await readdir('dist')).sort(), ['index.html', 'style.css', 'engine-offline.js', 'app-offline.js', 'README.txt', 'SUPPORTED_FEATURES.md', 'AUDIT_REPORT.md', 'NOTICE.txt', 'vendor'].sort());
  async function compareTree(folder='') {
    for(const entry of await readdir('dist/'+folder,{withFileTypes:true})) {
      const path=folder+entry.name;
      if(entry.isDirectory())await compareTree(path+'/');
      else assert.deepEqual(await readFile('dist/'+path),await readFile(path),path);
    }
  }
  await compareTree();
}
console.log('PASS: Markdown/TeX, metadata, ZIP, invalid paths, offline assets and distribution');

const { toOmml } = await import('./math-support.js');
const { DOMParser } = await import('@xmldom/xmldom');
for (const [tex, tag] of [[String.raw`\frac{1}{2}`, 'f'], [String.raw`\sqrt{x}`, 'rad'], [String.raw`x_i^2`, 'sSubSup'], [String.raw`\sum_{i=1}^n i`, 'nary'], [String.raw`\int_0^1 x^2 dx`, 'nary'], [String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`, 'm']]) {
  const omml=toOmml(tex,true);
  const xml=new DOMParser().parseFromString(omml,'application/xml');
  assert.ok(xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/officeDocument/2006/math',tag).length,tex);
  assert.match(omml,/<m:oMathPara/);
}
assert.throws(()=>toOmml(String.raw`\unknownCommand{x}`));
const protectedMath=String.raw`\[\begin{aligned}a_1 &= \textbf{x} \\ b &= \{1,2\}\end{aligned}\]`;
assert.equal(C.fromTex(protectedMath)[0].text,String.raw`\begin{aligned}a_1 &= \textbf{x} \\ b &= \{1,2\}\end{aligned}`);
assert.equal(C.mdBlocks('$$x^2$$')[0].type,'math');
console.log('PASS: JS-only editable OMML math, unsupported commands and protected TeX');

const special=toOmml(String.raw`\text{A \& B} < x`,true);
const specialXML=new DOMParser().parseFromString(special,'application/xml');
assert.ok(specialXML.documentElement.textContent.includes('&'));
assert.ok(specialXML.documentElement.textContent.includes('<'));
for(const match of (await readFile('vendor/katex.min.css','utf8')).matchAll(/url\(([^)]+)\)/g)) {
  assert.doesNotMatch(match[1],/^https?:/);
  await readFile('vendor/'+match[1].replace(/['"]/g,''));
}
assert.doesNotMatch(await readFile('vendor/math-libraries.js','utf8'), /XMLHttpRequest|new WebSocket|WebAssembly/);
console.log('PASS: math XML escaping, local fonts and JavaScript-only runtime');
