(() => {
  'use strict';
  const $ = id => document.getElementById(id), C = window.OfflineConverter;
  let inputFile=null,resources={},output=null,baseName='document',busy=false,previewUrls=[],inputPreviewUrls=[],liveTimer=null,inputTab='source';
  const demo = `# オフライン文書変換\n\nこのアプリは **インストール不要** で動きます。\n\n## 文字の装飾\n\n**太字**、*斜体*、~~取消線~~、\`コード\`。\n\n- 箇条書き\n- リンクや簡単な表に対応\n\n1. 入力する\n2. 変換する\n3. 保存する\n\n| 項目 | 状況 |\n| --- | --- |\n| Word (.docx) | 読み書きに対応 |\n| Markdown (.md) | 読み書きに対応 |\n| TeX (.tex) | 基本構文に対応 |\n\n> 複雑なWordのレイアウトは完全には再現できません。\n`;
  function status(s,kind=''){$('status').textContent=s;$('status').className=kind;}
  function setBusy(on){busy=on;document.body.classList.toggle('busy',on);$('convert').disabled=on;for(const id of ['from','to','open','choose-docx','clear','swap','sample','add-resources','standalone'])$(id).disabled=on;}
  function clearPreview(){for(const u of previewUrls)URL.revokeObjectURL(u);previewUrls=[];}
  function clearInputPreview(){for(const u of inputPreviewUrls)URL.revokeObjectURL(u);inputPreviewUrls=[];}
  function livePreview(){
    liveTimer=null;
    if($('from').value==='docx')return;
    clearInputPreview();
    const left=$('input-preview'),right=$('preview'),source=$('editor').value;
    if(!source.trim()){
      left.replaceChildren();left.textContent='ソースを入力すると、ここにプレビューが表示されます。';
      if(!output){clearPreview();right.replaceChildren();right.hidden=true;$('empty').hidden=false;$('result-meta').textContent='—';}
      return;
    }
    try{
      const blocks=$('from').value==='latex'?C.fromTex(source):C.mdBlocks(source);
      C.preview(blocks,left,resources,inputPreviewUrls);
      if(!blocks.length)left.textContent='表示できる内容がありません。';
      if(!output){
        clearPreview();C.preview(blocks,right,resources,previewUrls);
        right.hidden=false;$('empty').hidden=true;$('source').hidden=true;
        $('result-meta').textContent='ライブプレビュー · 未変換';
      }
    }catch(err){
      clearInputPreview();left.textContent='プレビューを表示できません: '+(err?.message||String(err));
      if(!output){clearPreview();right.textContent=left.textContent;right.hidden=false;$('empty').hidden=true;$('result-meta').textContent='プレビューにエラーがあります';}
    }
  }
  function scheduleLivePreview(immediate=false){
    if(liveTimer!==null){clearTimeout(liveTimer);liveTimer=null;}
    if($('from').value==='docx')return;
    if(immediate)livePreview();
    else liveTimer=setTimeout(livePreview,90);
  }
  function invalidate(){
    output=null;$('download').disabled=true;$('copy').disabled=true;$('source-tab').disabled=true;
    $('warnings').hidden=true;$('source').hidden=true;$('source').value='';
    $('preview-tab').classList.add('active');$('source-tab').classList.remove('active');
    $('preview-tab').setAttribute('aria-selected','true');$('source-tab').setAttribute('aria-selected','false');
    clearPreview();$('preview').replaceChildren();$('empty').hidden=false;$('preview').hidden=true;
    $('result-meta').textContent='—';scheduleLivePreview();
  }
  function setInputTab(next,focus=false){
    if($('from').value==='docx')return;
    inputTab=next;
    $('editor').hidden=next!=='source';$('input-preview').hidden=next!=='preview';
    $('edit-source-tab').classList.toggle('active',next==='source');
    $('edit-preview-tab').classList.toggle('active',next==='preview');
    $('edit-source-tab').setAttribute('aria-selected',String(next==='source'));
    $('edit-preview-tab').setAttribute('aria-selected',String(next==='preview'));
    if(next==='preview')scheduleLivePreview(true);
    if(focus)$(next==='source'?'editor':'input-preview').focus();
  }
  function inputChanged(){
    const isWord=$('from').value==='docx';
    $('input-tabs').hidden=isWord;$('editor').hidden=isWord||inputTab!=='source';
    $('input-preview').hidden=isWord||inputTab!=='preview';
    $('docx-input').hidden=!isWord;$('sample').hidden=isWord;
    $('docx-name').textContent=inputFile?.name||'Wordファイルを選択';
    $('docx-size').textContent=inputFile?`${(inputFile.size/1024).toFixed(1)} KB`:'.docxをここにドロップ';
    $('input-meta').textContent=isWord?(inputFile?'Word .docx':'ファイル未選択'):`${$('editor').value.length.toLocaleString()} 文字`;
    $('editor').placeholder=$('from').value==='latex'?'\\section{見出し}\n\n本文':'# 見出し\n\n本文';
  }
  async function importFile(file){if(busy)return;if(file.size>30*1024*1024)throw Error('入力ファイルは30 MB以下にしてください');const e=file.name.split('.').pop().toLowerCase();if(!['md','markdown','txt','tex','latex','docx'].includes(e))throw Error('.md / .tex / .docx を選んでください');invalidate();inputFile=e==='docx'?file:null;baseName=file.name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}._-]/gu,'_')||'document';$('from').value=e==='docx'?'docx':['tex','latex'].includes(e)?'latex':'markdown';if(e!=='docx')$('editor').value=await file.text();if($('from').value===$('to').value)$('to').value=$('from').value==='docx'?'markdown':'docx';setInputTab('source');inputChanged();scheduleLivePreview(true);status(`${file.name} を読み込みました`);}
  async function addResources(files){const next={...resources};for(const file of files){if(file.size>30*1024*1024)throw Error('関連ファイルは30 MB以下です');if(/\.zip$/i.test(file.name)){const items=await C.zipRead(file);for(const [name,bytes] of Object.entries(items))next[C.normalize(name)]=new Blob([bytes]);}else next[C.normalize(file.name)]=file;}resources=next;$('resource-count').textContent=`${Object.keys(resources).length} 件`;$('remove-resources').hidden=!Object.keys(resources).length;invalidate();status('関連ファイルを設定しました');}
  function showTab(source){if(!output)return;$('preview').hidden=source;$('source').hidden=!source;$('preview-tab').classList.toggle('active',!source);$('source-tab').classList.toggle('active',source);$('preview-tab').setAttribute('aria-selected',String(!source));$('source-tab').setAttribute('aria-selected',String(source));}
  function getNotices(blocks,to,available={}){
    const n=['Pandocを使わない簡易オフライン変換版です。複雑な書式・脚注・独自マクロは完全には保持されません。'];
    if(blocks.some(x=>x.type==='math'||(/\$[^$]+\$/.test(x.text||'')))&&to==='docx')n.push('数式はWordの編集可能な数式（OMML）に変換せず、テキストとして保存します。');
    if(blocks.some(x=>x.type==='table'))n.push('表の幅・結合セル・列揃えは元と異なる場合があります。');
    if(blocks.some(x=>x.type==='frontmatter')&&to!=='markdown')n.push('MarkdownのYAMLフロントマターはプレビューに表示せず、Word/TeX本文にも追加しません。');
    if(blocks.some(x=>x.type==='table'&&x.hasHeader!==false)&&to==='latex')n.push('TeXのtabularにはMarkdownの見出し行の意味がありません。TeXから再変換すると見出し扱いは維持されません。');
    const sourceTexts=blocks.flatMap(b=>[b.text||'',...(b.items||[]),...(b.rows||[]).flat()]);
    const images=sourceTexts.flatMap(t=>[...t.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m=>m[1]));
    const missing=images.filter(path=>{try{return !available[C.normalize(path)];}catch{return true;}});
    if(missing.length&&to==='docx')n.push('画像ファイルが見つからないため、画像を捏造せず、元の画像記法をテキストとして残しました: '+[...new Set(missing)].slice(0,5).join('、'));
    return n;
  }
  async function convert(){if(busy)return;let blocks,available={...resources};const from=$('from').value,to=$('to').value;
    if(from==='docx'&&!inputFile){status('Word .docx ファイルを選択してください','error');return;}
    if(from!=='docx'&&!$('editor').value.trim()){status('変換する文書を入力してください','error');return;}
    invalidate();setBusy(true);status('変換中…');
    try{
      // Yield once so the progress label can be rendered.
      await new Promise(resolve=>setTimeout(resolve,0));
      if(from==='docx'){const imported=await C.docxRead(inputFile);blocks=imported.blocks;available={...imported.resources,...available};}
      else if(from==='markdown')blocks=C.mdBlocks($('editor').value);
      else blocks=C.fromTex($('editor').value);
      if(!blocks.length)throw Error('文書に変換可能な内容が見つかりません');
      const name=baseName+'.'+({docx:'docx',markdown:'md',latex:'tex'}[to]);let blob,txt='';
      if(to==='docx')blob=await C.buildDocx(blocks,available);
      else {txt=to==='markdown'?C.blocksToMarkdown(blocks):C.toTex(blocks,$('standalone').checked);blob=new Blob([txt],{type:'text/plain;charset=utf-8'});}
      let archive=null;
      if(to!=='docx'){
        const used={};let i=0;
        for(const [path,file] of Object.entries(available)){
          if(++i>100)throw Error('関連ファイルが多すぎます');
          if(path&&(/^media\//.test(path)||txt.includes(path)))used[path]=new Uint8Array(await file.arrayBuffer());
        }
        if(Object.keys(used).length){used[name]=new Uint8Array(await blob.arrayBuffer());archive=C.zipWrite(used);}
      }
      // Preview the actual serialized output, not the original source blocks.
      // This avoids suggesting that a construct survived a conversion when it did not.
      let displayBlocks=blocks,displayResources=available;
      if(to==='docx'){
        const actual=await C.docxRead(blob);
        displayBlocks=actual.blocks;displayResources={...actual.resources,...available};
      }else if(to==='markdown')displayBlocks=C.mdBlocks(txt);
      else displayBlocks=C.fromTex(txt);
      output={blob,txt,name,blocks,resources:available,archive,to};
      C.preview(displayBlocks,$('preview'),displayResources,previewUrls);
      $('source').value=txt;$('empty').hidden=true;$('preview').hidden=false;$('download').disabled=false;$('copy').disabled=to==='docx';$('source-tab').disabled=to==='docx';
      $('result-meta').textContent=`${{docx:'Word .docx',markdown:'Markdown .md',latex:'TeX .tex'}[to]} · ${(blob.size/1024).toFixed(1)} KB${archive?' · 画像などの関連ファイルあり':''}`;
      const notices=getNotices(blocks,to,available);$('warnings').hidden=false;$('warning-text').textContent=notices.join('\n\n');
      status('変換しました。ダウンロードできます。','success');
    }catch(err){console.error(err);status('変換に失敗しました: '+(err?.message||String(err)),'error');}
    finally{setBusy(false);}
  }
  $('convert').onclick=convert;
  $('download').onclick=()=>{if(!output)return;const blob=output.archive||output.blob,name=output.archive?baseName+'-with-assets.zip':output.name,url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);};
  $('copy').onclick=async()=>{if(!output?.txt)return;try{await navigator.clipboard.writeText(output.txt);}catch{const area=$('source');area.hidden=false;area.select();document.execCommand('copy');showTab(true);}status('変換結果をコピーしました','success');};
  $('preview-tab').onclick=()=>showTab(false);$('source-tab').onclick=()=>showTab(true);
  $('edit-source-tab').onclick=()=>setInputTab('source',true);
  $('edit-preview-tab').onclick=()=>setInputTab('preview',true);
  $('input-preview').addEventListener('keydown',e=>{
    if(e.key==='Tab'&&!e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&e.target===$('input-preview')){
      e.preventDefault();setInputTab('source',true);
    }
  });
  $('from').onchange=()=>{inputTab='source';setInputTab('source');inputChanged();invalidate();};$('to').onchange=invalidate;$('standalone').onchange=invalidate;
  $('editor').oninput=()=>{invalidate();inputChanged();status('編集中 — プレビューを自動更新しています');};
  $('editor').onkeydown=e=>{
    if(e.key==='Tab'&&!e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey){
      e.preventDefault();setInputTab('preview',true);
    }
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();convert();}
  };
  $('sample').onclick=()=>{inputFile=null;baseName='sample';setInputTab('source');$('editor').value=$('from').value==='latex'?'\\section{サンプル}\n\nこれは\\textbf{太字}です。\n\n\\begin{itemize}\n\\item 一つ目\n\\item 二つ目\n\\end{itemize}':demo;invalidate();inputChanged();status('サンプルを入力しました');};
  $('clear').onclick=()=>{setInputTab('source');$('editor').value='';inputFile=null;baseName='document';invalidate();inputChanged();status('入力を消去しました');};
  for(const id of ['open','choose-docx'])$(id).onclick=()=>$('file').click();
  $('file').onchange=async e=>{try{if(e.target.files[0])await importFile(e.target.files[0]);}catch(err){status(err.message,'error');}e.target.value='';};
  const area=$('drop-area');for(const evt of ['dragenter','dragover'])area.addEventListener(evt,e=>{e.preventDefault();area.classList.add('drag');});for(const evt of ['dragleave','drop'])area.addEventListener(evt,e=>{e.preventDefault();area.classList.remove('drag');});area.addEventListener('drop',async e=>{try{if(e.dataTransfer.files[0])await importFile(e.dataTransfer.files[0]);}catch(err){status(err.message,'error');}});
  $('add-resources').onclick=()=>$('resources').click();$('resources').onchange=async e=>{try{await addResources(e.target.files);}catch(err){status(err.message,'error');}e.target.value='';};
  $('remove-resources').onclick=()=>{resources={};$('resource-count').textContent='未選択';$('remove-resources').hidden=true;invalidate();};
  $('swap').onclick=()=>{if(!output)return status('先に一度変換してください','error');const oldFrom=$('from').value,oldTo=$('to').value;$('from').value=oldTo;$('to').value=oldFrom;if(oldTo==='docx'){inputFile=new File([output.blob],output.name,{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});}else{inputFile=null;$('editor').value=output.txt;}invalidate();inputChanged();status('変換結果を入力に移しました');};
  $('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
  // The full Pandoc feature set, including a reference Word template, is not provided by this dependency-free build.
  $('add-reference').disabled=true;$('add-reference').title='簡易オフライン版では未対応です';$('reference-name').textContent='未対応（簡易版）';$('remove-reference').hidden=true;
  $('cancel').hidden=true;
  inputChanged();scheduleLivePreview(true);status('準備完了','success');
})();
