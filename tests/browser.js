(async () => {
  const C = window.OfflineConverter, results = document.getElementById('results');
  let passed = 0, failed = 0;
  const check = (ok, message) => { if (!ok) throw Error(message); };
  async function test(name, fn) {
    const item = document.createElement('li'); results.append(item);
    try { await fn(); passed++; item.textContent = 'PASS: ' + name; }
    catch (e) { failed++; item.textContent = 'FAIL: ' + name + ' — ' + e.message; console.error(e); }
  }
  const source = '# 日本語見出し\n\n**太字** と *斜体*、<u>下線</u>、==強調==、<sup>2</sup>、<sub>i</sub>\n\n- 項目\n\n- [x] 完了\n\n| 列 | 値 |\n| --- | --- |\n| A | B |\n\n[リンク](https://example.com)\n';
  const blocks = C.mdBlocks(source);
  let word;
  await test('Markdown → Word → Markdown / TeX（3方向）', async () => {
    word = await C.buildDocx(blocks, {});
    const back = await C.docxRead(word);
    check(C.blocksToMarkdown(back.blocks).includes('# 日本語見出し'), '見出しの往復');
    check(C.toTex(back.blocks).includes('\\section{日本語見出し}'), 'Word → TeX');
    const files = await C.zipRead(word), xml = new TextDecoder().decode(files['word/document.xml']);
    for (const tag of ['<w:b/>', '<w:i/>', '<w:u ', '<w:highlight ', '<w:vertAlign ', '<w:tbl>', '<w:hyperlink ']) check(xml.includes(tag), tag);
  });
  await test('Markdown → TeX → Markdown / Word（残り3方向）', async () => {
    const tex = C.toTex(blocks), back = C.fromTex(tex);
    check(tex.includes('\\section{日本語見出し}'), 'Markdown → TeX');
    check(C.blocksToMarkdown(back).includes('# 日本語見出し'), 'TeX → Markdown');
    check(C.blocksToMarkdown((await C.docxRead(await C.buildDocx(back, {}))).blocks).includes('日本語見出し'), 'TeX → Word');
  });
  await test('画像の埋め込みとWordからの取り出し', async () => {
    const image = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nVAAAAAASUVORK5CYII='), c => c.charCodeAt(0))], { type: 'image/png' });
    const doc = await C.buildDocx(C.mdBlocks('![画像](pixel.png)'), { 'pixel.png': image });
    const back = await C.docxRead(doc);
    check(Object.keys(back.resources).length === 1, '画像取り出し');
    check(C.blocksToMarkdown(back.blocks).includes('!['), '画像記法');
  });
  await test('見出し・引用・未提供画像・任意HTMLのプレビュー', () => {
    const host = document.createElement('div');
    C.preview(C.mdBlocks('# 題名\n\n> 引用\n\n![説明](missing.png)\n\n<script>alert(1)</script>'), host);
    check(!host.querySelector('hr'), '余分な水平線');
    check(!host.querySelector('img'), '外部画像を読み込まない');
    check(host.textContent.includes('![説明](missing.png)'), '架空の説明文を足さない');
    check(!host.querySelector('script'), '任意HTMLを実行しない');
  });
  await test('YAMLと明示的な水平線の区別 / TeXコメント', () => {
    check(!C.mdBlocks('---\ntitle: metadata\n---\n本文').some(b => b.type === 'hr'), 'YAML誤認');
    check(C.mdBlocks('本文\n\n---').filter(b => b.type === 'hr').length === 1, '明示的な水平線');
    const tex = C.blocksToMarkdown(C.fromTex('本文 % hidden-comment\n\n\\begin{verbatim}\n100% code\n\\end{verbatim}'));
    check(!tex.includes('hidden-comment') && tex.includes('100% code'), 'コメントとverbatim');
  });
  await test('見出し・罫線なし表のWord/Markdown往復', async () => {
    const table = [{ type: 'table', hasHeader: false, borders: false, rows: [['A', 'B'], ['C', 'D']] }];
    const back = await C.docxRead(await C.buildDocx(table, {}));
    const md = C.blocksToMarkdown(back.blocks);
    check(md.includes('<table>') && !md.includes('| ---'), 'HTML表で保持');
    const doc = await C.buildDocx(C.mdBlocks(md), {}), files = await C.zipRead(doc);
    const xml = new TextDecoder().decode(files['word/document.xml']);
    check(!xml.includes('<w:tblHeader') && !xml.includes('<w:tblBorders'), 'Wordに見出しや罫線を追加しない');
  });
  await test('Wordの非表示文字・フィールド命令・通常ListParagraph', async () => {
    const files = await C.zipRead(word);
    files['word/document.xml'] = new TextEncoder().encode('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr><w:r><w:t>普通の段落</w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t>hidden-run</w:t></w:r><w:r><w:instrText>field-instruction</w:instrText></w:r></w:p></w:body></w:document>');
    const back = await C.docxRead(C.zipWrite(files));
    check(back.blocks[0].type === 'p', '勝手にリスト化しない');
    const md = C.blocksToMarkdown(back.blocks);
    check(!md.includes('hidden-run') && !md.includes('field-instruction'), '非表示要素');
  });
  await test('Word内のリテラル記号とチェックリスト', async () => {
    const literal = [{ type: 'p', text: '\\-\\-\\- \\*\\* \\$x\\$' }];
    const back = await C.docxRead(await C.buildDocx(literal, {}));
    const host = document.createElement('div'); C.preview(back.blocks, host);
    check(host.textContent.includes('--- ** $x$') && !host.querySelector('hr,strong'), '文字と装飾を区別');
    const checklist = await C.docxRead(await C.buildDocx(C.mdBlocks('- [x] 完了'), {}));
    check(C.blocksToMarkdown(checklist.blocks).includes('[x]'), 'チェック項目');
  });
  await test('圧縮済みWordの読み込み（deflate-raw）', async () => {
    const bytes = Uint8Array.from(atob('UEsDBBQAAAAIAHaUWl36nXSVjQAAAL4AAAARAAAAd29yZC9kb2N1bWVudC54bWxFjkkOwyAMRa+COECcdtFFlGHRQ3RNg5MgxRgZMvT2hXTRzbOsZ3/9djhpVTtKdOw7fatqPfTt0VgeN0KfVNY+Nkenl5RCAxDHBcnEigP67CYWMimvMsPBYoPwiDE6P9MK97p+ABnndYl8s/2UGQqkIPVPpiD5Hq165W81uTNtgi0UWSgXw8VfAPzL9V9QSwECFAAUAAAACAB2lFpd+p10lY0AAAC+AAAAEQAAAAAAAAAAAAAAgAEAAAAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAEAAQA/AAAAvAAAAAAA'), c => c.charCodeAt(0));
    const back = await C.docxRead(new Blob([bytes]));
    check(C.blocksToMarkdown(back.blocks).includes('Compressed Word fixture'), '圧縮Wordの展開');
  });
  await test('壊れたWordの拒否', async () => {
    let rejected = false; try { await C.docxRead(new Blob(['broken'])); } catch { rejected = true; }
    check(rejected, '不正ファイルを拒否');
  });
  const frame = document.getElementById('app');
  if (!frame.contentDocument?.getElementById('editor')) await new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  const doc = frame.contentDocument, win = frame.contentWindow, $ = id => doc.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  await test('UI: 初期準備完了・Tab往復・ライブ更新（Markdown/TeX）', async () => {
    check($('status').textContent.includes('準備完了'), 'エンジン待機なし');
    for (const type of ['markdown', 'latex']) {
      $('from').value = type; $('from').dispatchEvent(new win.Event('change'));
      $('editor').value = type === 'markdown' ? '# Live heading' : '\\section{Live heading}';
      $('editor').dispatchEvent(new win.Event('input')); await wait(140);
      check($('input-preview').textContent.includes('Live heading'), 'ライブ更新: ' + type);
      $('editor').focus(); $('editor').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      check($('editor').hidden && !$('input-preview').hidden && doc.activeElement === $('input-preview'), 'Tab → プレビュー');
      $('input-preview').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      check(!$('editor').hidden && doc.activeElement === $('editor'), 'Tab → ソース');
    }
  });
  await test('UI: Word変換・出力再読込プレビュー・編集後ダウンロード無効化', async () => {
    $('to').value = 'docx'; $('to').dispatchEvent(new win.Event('change')); $('convert').click();
    for (let i = 0; i < 100 && $('download').disabled; i++) await wait(20);
    check(!$('download').disabled && $('status').textContent.includes('変換しました'), 'Word出力');
    check($('preview').textContent.includes('Live heading'), '変換後プレビュー');
    check(!$('preview').querySelector('hr'), '余計な線なし');
    $('editor').value += '\n新しい本文'; $('editor').dispatchEvent(new win.Event('input'));
    check($('download').disabled, '古い結果を保存しない');
  });
  document.getElementById('summary').textContent = `${failed ? 'FAIL' : 'PASS'}: ${passed} passed, ${failed} failed`;
  document.title = document.getElementById('summary').textContent;
})();
