/* Fully offline document converter, no packages and no network access. */
(() => {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const P = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const ext = s => String(s).split('.').pop().toLowerCase();
  function normalize(p) { const arr=[]; for (const s of p.replaceAll('\\','/').split('/')) { if(!s || s==='.')continue; if(s==='..') { if(!arr.length) throw Error('不正なファイルパスです'); arr.pop(); } else arr.push(s); } return arr.join('/'); }
  function getChildren(node, tag){return Array.from(node?.children||[]).filter(x=>x.localName===tag);}
  function first(node, tag){return getChildren(node,tag)[0];}
  function at(node, tag, ns = W){return Array.from(node?.getElementsByTagNameNS(ns,tag)||[])[0];}
  function attr(node, name, ns = W){return node?.getAttributeNS(ns,name) ?? node?.getAttribute('w:'+name) ?? node?.getAttribute(name) ?? '';}
  const parseXML = s => {const d = new DOMParser().parseFromString(s,'application/xml'); if(d.querySelector('parsererror')) throw Error('WordのXMLを読み込めませんでした');return d;};
  function crc32(bytes) { let crc = -1; for(const b of bytes){ crc ^= b; for(let i=0;i<8;i++) crc = (crc>>>1) ^ (0xedb88320 & -(crc&1)); } return (crc^(-1))>>>0; }
  function concat(parts){const n=parts.reduce((a,x)=>a+x.length,0),b=new Uint8Array(n);let p=0;for(const x of parts){b.set(x,p);p+=x.length;}return b;}
  function u16(v){return new Uint8Array([v&255,(v>>>8)&255]);}
  function u32(v){return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]);}
  function zipWrite(files){
    const out=[],cent=[];let pos=0;
    for(const [name, data] of Object.entries(files)){
      const fn=enc.encode(normalize(name)), bytes=typeof data==='string'?enc.encode(data):new Uint8Array(data), crc=crc32(bytes);
      const local=concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0x21),u32(crc),u32(bytes.length),u32(bytes.length),u16(fn.length),u16(0),fn,bytes]);
      out.push(local);
      cent.push(concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0x21),u32(crc),u32(bytes.length),u32(bytes.length),u16(fn.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(pos),fn]));
      pos+=local.length;
    }
    const central=concat(cent),end=concat([u32(0x06054b50),u16(0),u16(0),u16(cent.length),u16(cent.length),u32(central.length),u32(pos),u16(0)]);
    return new Blob([...out,central,end],{type:'application/zip'});
  }
  async function zipRead(input, filter){
    const bytes=input instanceof Uint8Array?input:new Uint8Array(await input.arrayBuffer()),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let end=-1;
    for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(v.getUint32(p,true)===0x06054b50){end=p;break;}}
    if(end<0)throw Error('ZIP形式が不正です（.docxもZIP形式です）。');
    const count=v.getUint16(end+10,true),start=v.getUint32(end+16,true),res={};let p=start,total=0;
    if(count>2000)throw Error('ZIPのファイル数が多すぎます');
    for(let i=0;i<count;i++){
      if(v.getUint32(p,true)!==0x02014b50)throw Error('ZIPのファイル一覧が破損しています');
      const flag=v.getUint16(p+8,true),method=v.getUint16(p+10,true),size=v.getUint32(p+20,true),raw=v.getUint32(p+24,true),flen=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),offset=v.getUint32(p+42,true);
      const name=dec.decode(bytes.subarray(p+46,p+46+flen));p+=46+flen+extra+comment;
      if(!name || name.endsWith('/') || (filter&&!filter(name)))continue;
      if(flag&1)throw Error('暗号化ZIPには対応していません');
      if(raw>60*1024*1024||(total+=raw)>100*1024*1024) throw Error('ZIPの展開サイズが大きすぎます');
      if(v.getUint32(offset,true)!==0x04034b50)throw Error('ZIPのデータが破損しています');
      const dataOffset=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);
      const data=bytes.subarray(dataOffset,dataOffset+size);
      if(data.length!==size)throw Error('ZIPファイルの末尾が破損しています');
      let content;
      if(method===0) content=new Uint8Array(data);
      else if(method===8){
        if(!('DecompressionStream' in window))throw Error('Wordの展開には新しいChrome/Edgeが必要です');
        try {content=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}
        catch {throw Error('ZIPの解凍に失敗しました。ChromeまたはEdgeの最新版をお試しください');}
      } else throw Error('未対応のZIP圧縮形式です');
      if(content.length!==raw)throw Error('ZIPの展開サイズが一致しません');
      res[normalize(name)]=content;
    }
    return res;
  }
  function mdBlocks(src){
    const lines=String(src).replace(/\r\n?/g,'\n').split('\n'), b=[];let i=0;
    const blank=()=>!lines[i]?.trim();
    // YAML front matter at the start is document metadata, not two horizontal rules.
    // Preserve it in Markdown, but do not insert its contents into document previews.
    if(lines[0]?.trim()==='---'){
      const end=lines.findIndex((line,j)=>j>0&&j<=100&&(line.trim()==='---'||line.trim()==='...'));
      if(end>1 && lines.slice(1,end).some(line=>/^\s*[\w-]+\s*:\s*/.test(line))){
        b.push({type:'frontmatter',text:lines.slice(0,end+1).join('\n')});i=end+1;
      }
    }
    while(i<lines.length){
      if(blank()){i++;continue;}
      let s=lines[i],m;
      if((m=s.match(/^\s{0,3}(```+|~~~+)(.*)$/))){const fence=m[1],lang=m[2].trim(),a=[];i++;while(i<lines.length&&!lines[i].trimStart().startsWith(fence)){a.push(lines[i++]);}if(i<lines.length)i++;b.push({type:'code',text:a.join('\n'),lang});continue;}
      if((m=s.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))){b.push({type:'heading',level:m[1].length,text:m[2]});i++;continue;}
      if(/^\s{0,3}(---+|\*\*\*+|___+)\s*$/.test(s)){b.push({type:'hr'});i++;continue;}
      if(s.trim()==='$$'){const a=[];i++;while(i<lines.length&&lines[i].trim()!=='$$')a.push(lines[i++]);if(i<lines.length)i++;b.push({type:'math',text:a.join('\n')});continue;}
      if(/^\s{0,3}>/.test(s)){const a=[];while(i<lines.length&&/^\s{0,3}>/.test(lines[i]))a.push(lines[i++].replace(/^\s{0,3}> ?/,''));b.push({type:'quote',text:a.join(' ')});continue;}
      // A Word/TeX table without a heading row cannot be represented by a GFM pipe table
      // without inventing a heading. Preserve it as a plain HTML <table> instead.
      if(/^\s*<table(?:\s[^>]*)?>\s*$/i.test(s)){
        const a=[s];i++;while(i<lines.length){const line=lines[i++];a.push(line);if(/<\/table\s*>/i.test(line))break;}
        if(a.some(line=>/<\/table\s*>/i.test(line))){
          const doc=new DOMParser().parseFromString(a.join('\n'),'text/html'),table=doc.querySelector('table');
          if(table){const rows=Array.from(table.querySelectorAll('tr')).map(tr=>Array.from(tr.children).filter(el=>el.tagName==='TD'||el.tagName==='TH').map(el=>el.textContent));
            b.push({type:'table',rows,hasHeader:!!table.querySelector('tr:first-child th'),borders:table.getAttribute('data-borders')==='yes'});continue;}
        }
        b.push({type:'p',text:a.join(' ')});continue;
      }
      if(/^\s{0,3}\|/.test(s)&&i+1<lines.length&&/^\s*\|?\s*:?-{2,}/.test(lines[i+1])){
        const split=x=>x.trim().replace(/^\|/,'').replace(/\|$/,'').split(/(?<!\\)\|/).map(y=>y.trim());
        const rows=[split(lines[i])];i+=2;while(i<lines.length&&/^\s*\|/.test(lines[i]))rows.push(split(lines[i++]));b.push({type:'table',rows,hasHeader:true,borders:true});continue;
      }
      if((m=s.match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/))){const ordered=/\d/.test(m[1]),items=[];
        while(i<lines.length){const li=lines[i].match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/);if(!li||(/\d/.test(li[1])!==ordered))break;items.push(li[2].replace(/^\[([ xX])\]\s+/,(a,c)=>c===' '?'☐ ':'☑ '));i++;}
        b.push({type:'list',ordered,items});continue;
      }
      const a=[];
      while(i<lines.length&&lines[i].trim()&&!/^\s{0,3}(#{1,6}\s|>|[-+*]\s|\d+[.)]\s|```|~~~|\||(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i]))a.push(lines[i++]);
      if(!a.length) a.push(lines[i++]);b.push({type:'p',text:a.join(' ')});
    }
    return b;
  }
  function blocksToMarkdown(blocks){return blocks.map(b=>{
    switch(b.type){case 'frontmatter':return b.text;case 'heading':return '#'.repeat(b.level)+' '+b.text;case 'p':return b.text;case 'quote':return '> '+b.text.replaceAll('\n','\n> ');case 'hr':return '---';case 'code':return '```'+(b.lang||'')+'\n'+b.text+'\n```';case 'math':return '$$\n'+b.text+'\n$$';case 'list':return b.items.map((x,i)=>(b.ordered?`${i+1}. `:'- ')+x.replace(/^☐\s+/,'[ ] ').replace(/^☑\s+/,'[x] ')).join('\n');case 'table':return b.hasHeader===false ? '<table'+(b.borders?' data-borders="yes"':'')+'>\n'+b.rows.map(r=>'  <tr>'+r.map(c=>'<td>'+esc(decodeMdEscapes(c))+'</td>').join('')+'</tr>').join('\n')+'\n</table>' : b.rows.map((r,i)=>'| '+r.map(c=>c.replace(/(?<!\\)\|/g,'\\|')).join(' | ')+' |'+(i===0?'\n| '+r.map(()=>'---').join(' | ')+' |':'')).join('\n');default:return '';}
  }).join('\n\n').trim()+'\n';}
  // Word plain text must not turn into Markdown syntax during a round trip.
  const escapeMdLiteral = text => String(text).replace(/([\\`*_{}\[\]()#+\-.!|>$=~<>])/g,'\\$1');
  const decodeMdEscapes = text => String(text).replace(/\\([\\`*_{}\[\]()#+\-.!|>$=~<>])/g,'$1');
  // A deliberately small, safe subset of Markdown inline syntax; arbitrary HTML is not executed.
  function inlineParts(s){
    const re = /(<u>[^\n]+?<\/u>|<sup>[^\n]+?<\/sup>|<sub>[^\n]+?<\/sub>|==[^=\n]+==|!?\[[^\]]*\]\([^)]*\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|(?<![\w])_[^_\n]+_(?![\w])|`[^`\n]+`|\$[^$\n]+\$)/gi;
    const parts=[]; let prev=0,m;
    while((m=re.exec(s))){
      // Ignore markup escaped with an odd number of backslashes.
      const prefix=s.slice(0,m.index),slashes=prefix.match(/\\+$/)?.[0].length||0;
      if(slashes%2)continue;
      if(m.index>prev)parts.push({type:'text',text:decodeMdEscapes(s.slice(prev,m.index))});
      const x=m[0];let type='text',value=x,href='';
      if(x.startsWith('![')){type='image';const k=x.indexOf('](');value=x.slice(2,k);href=x.slice(k+2,-1);}
      else if(x.startsWith('[')){type='link';const k=x.indexOf('](');value=x.slice(1,k);href=x.slice(k+2,-1);}
      else if(x.startsWith('**')||x.startsWith('__')){type='bold';value=x.slice(2,-2);}
      else if(x.startsWith('~~')){type='strike';value=x.slice(2,-2);}
      else if(x.startsWith('==')){type='highlight';value=x.slice(2,-2);}
      else if(/^<u>/i.test(x)){type='underline';value=x.slice(3,-4);}
      else if(/^<sup>/i.test(x)){type='sup';value=x.slice(5,-6);}
      else if(/^<sub>/i.test(x)){type='sub';value=x.slice(5,-6);}
      else if(x.startsWith('*')||x.startsWith('_')){type='italic';value=x.slice(1,-1);}
      else if(x.startsWith('`')){type='code';value=x.slice(1,-1);}
      else if(x.startsWith('$')){type='math';value=x.slice(1,-1);}
      parts.push({type,text:value,href});prev=re.lastIndex;
    }
    if(prev<s.length)parts.push({type:'text',text:decodeMdEscapes(s.slice(prev))});
    return parts;
  }
  function texEscape(s){return s.replace(/\\/g,'\\textbackslash{}').replace(/([%$&#_{}])/g,'\\$1').replace(/\^/g,'\\textasciicircum{}').replace(/~/g,'\\textasciitilde{}');}
  function inlineTex(s){return inlineParts(s).map(v=>{const t=texEscape(v.text);switch(v.type){case 'bold':return `\\textbf{${t}}`;case 'italic':return `\\emph{${t}}`;case 'strike':return `\\sout{${t}}`;case 'underline':return `\\underline{${t}}`;case 'highlight':return `\\colorbox{yellow}{${t}}`;case 'sup':return `\\textsuperscript{${t}}`;case 'sub':return `\\textsubscript{${t}}`;case 'code':return `\\texttt{${t}}`;case 'link':return `\\href{${texEscape(v.href)}}{${t}}`;case 'image':return `\\includegraphics[width=.7\\linewidth]{${texEscape(v.href)}}`;case 'math':return '$'+v.text+'$';default:return t;}}).join('');}
  function toTex(blocks,standalone=true){let body=blocks.map(b=>{
    switch(b.type){case 'heading':return `\\${['section','subsection','subsubsection','paragraph','subparagraph','subparagraph'][b.level-1]}{${inlineTex(b.text)}}`;
      case 'p':return inlineTex(b.text);case 'hr':return '\\hrule';case 'math':return '\\[\n'+b.text+'\n\\]';case 'code':return '\\begin{verbatim}\n'+b.text+'\n\\end{verbatim}';case 'quote':return '\\begin{quote}\n'+inlineTex(b.text)+'\n\\end{quote}';
      case 'list':return `\\begin{${b.ordered?'enumerate':'itemize'}}\n`+b.items.map(t=>'\\item '+inlineTex(t)).join('\n')+`\n\\end{${b.ordered?'enumerate':'itemize'}}`;
      case 'table':{const w=Math.max(1,...b.rows.map(r=>r.length));const rules=b.borders!==false;return `\\begin{tabular}{${'l'.repeat(w)}}\n`+(rules?'\\hline\n':'')+b.rows.map(r=>r.map(inlineTex).join(' & ')+' \\\\'+(rules?'\n\\hline':'')).join('\n')+'\n\\end{tabular}';}
      default:return '';
    }
  }).join('\n\n');
    if(!standalone)return body+'\n';
    return '\\documentclass{ltjsarticle}\n\\usepackage{graphicx}\n\\usepackage{hyperref}\n\\usepackage{xcolor}\n\\usepackage[normalem]{ulem}\n\\begin{document}\n'+body+'\n\\end{document}\n';
  }
  function texInline(s){
    let t=s.replace(/\\href\{([^{}]*)\}\{([^{}]*)\}/g,(_,url,title)=>`[${title}](${url})`)
      .replace(/\\(?:textbf|bfseries)\{([^{}]*)\}/g,'**$1**').replace(/\\(?:emph|textit)\{([^{}]*)\}/g,'*$1*')
      .replace(/\\texttt\{([^{}]*)\}/g,'`$1`').replace(/\\sout\{([^{}]*)\}/g,'~~$1~~')
      .replace(/\\underline\{([^{}]*)\}/g,'<u>$1</u>').replace(/\\colorbox\{yellow\}\{([^{}]*)\}/g,'==$1==')
      .replace(/\\textsuperscript\{([^{}]*)\}/g,'<sup>$1</sup>').replace(/\\textsubscript\{([^{}]*)\}/g,'<sub>$1</sub>')
      .replace(/\\includegraphics(?:\[[^\]]*\])?\{([^{}]*)\}/g,'![]($1)')
      .replace(/\\textbackslash\{\}/g,'\\').replace(/\\textasciitilde\{\}/g,'~').replace(/\\textasciicircum\{\}/g,'^')
      .replace(/\\\((.*?)\\\)/g,'$$$1$').replace(/\\([%$&#_{}])/g,(_,ch)=>'$_#'.includes(ch)?'\\'+ch:ch).replace(/\\(?:LaTeX|TeX)(?![A-Za-z])/g,'$&');
    return t.replace(/\\(?:noindent|par)\b/g,'').trim();
  }
  function removeTexComments(src){
    let verbatim=false;
    return String(src).replace(/\r\n?/g,'\n').split('\n').map(line=>{
      if(verbatim){if(/\\end\{verbatim\}/.test(line))verbatim=false;return line;}
      // Do not remove literal '%' inside a verbatim environment.
      const verb=line.search(/\\begin\{verbatim\}/);
      const limit=verb<0?line.length:verb;
      for(let i=0;i<limit;i++)if(line[i]==='%'){
        let n=0;for(let k=i-1;k>=0&&line[k]==='\\';k--)n++;
        if(n%2===0)return line.slice(0,i);
      }
      if(verb>=0)verbatim=true;
      return line;
    }).join('\n');
  }
  function fromTex(src){let s=removeTexComments(src);
    const beg=s.indexOf('\\begin{document}'),end=s.indexOf('\\end{document}');if(beg>=0)s=s.slice(beg+16,end>=0?end:undefined);
    s=s.replace(/\\(section|subsection|subsubsection|paragraph|subparagraph)\*?\{([^{}]*)\}/g,(_,k,t)=>'#'.repeat({section:1,subsection:2,subsubsection:3,paragraph:4,subparagraph:5}[k])+' '+texInline(t)+'\n');
    s=s.replace(/^\s*\\hrule\s*$/gm,'---');
    s=s.replace(/\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g,(_,k,v)=>v.split(/\\item\s+/).slice(1).map((t,i)=>(k==='enumerate'?`${i+1}. `:'- ')+texInline(t.trim())).join('\n'));
    s=s.replace(/\\begin\{quote\}([\s\S]*?)\\end\{quote\}/g,(_,v)=>v.trim().split('\n').map(x=>'> '+texInline(x)).join('\n'));
    s=s.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g,(_,v)=>'```\n'+v.trim()+'\n```');
    s=s.replace(/\\\[([\s\S]*?)\\\]/g,(_,v)=>'$$\n'+v.trim()+'\n$$');
    s=s.replace(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g,(_,v)=>{
      const bordered=/\\hline\b/.test(v);const rows=v.replace(/\\hline/g,'').split(/\\\\/).map(y=>y.trim()).filter(Boolean).map(y=>y.split(/(?<!\\)&/).map(z=>texInline(z.trim())));
      if(!rows.length)return '';return blocksToMarkdown([{type:'table',rows,hasHeader:false,borders:bordered}]).trim();
    });
    return mdBlocks(s.split('\n').map(texInline).join('\n').trim());
  }
  async function docxRead(input){
    const z=await zipRead(input,p=>p.startsWith('word/')); if(!z['word/document.xml'])throw Error('Word .docx の本文を読み込めませんでした');
    const xml=parseXML(dec.decode(z['word/document.xml']));const body=at(xml,'body'), blocks=[],resources={}, rels={};
    if(z['word/_rels/document.xml.rels']){const x=parseXML(dec.decode(z['word/_rels/document.xml.rels']));for(const r of x.getElementsByTagNameNS(P,'Relationship')) rels[r.getAttribute('Id')]={target:r.getAttribute('Target'),type:r.getAttribute('Type'),external:r.getAttribute('TargetMode')==='External'};}
    const numberFormats={};
    if(z['word/numbering.xml']){
      try{
        const numXML=parseXML(dec.decode(z['word/numbering.xml'])),abstract={};
        for(const el of numXML.getElementsByTagNameNS(W,'abstractNum')){
          const id=attr(el,'abstractNumId');const lvl=Array.from(el.getElementsByTagNameNS(W,'lvl')).find(n=>attr(n,'ilvl')==='0');
          abstract[id]=attr(first(lvl,'numFmt'),'val');
        }
        for(const el of numXML.getElementsByTagNameNS(W,'num')){
          const id=attr(el,'numId'),abs=attr(first(el,'abstractNumId'),'val');
          numberFormats[id]=abstract[abs]||'';
        }
      }catch(e){console.warn('Numbering metadata could not be read',e);}
    }
    function textRun(r){
      const properties=first(r,'rPr');
      const hidden=first(properties,'vanish')||first(properties,'webHidden');
      if(hidden && !['0','false','off'].includes(attr(hidden,'val').toLowerCase()))return '';
      let v='';for(const c of r.children){if(c.localName==='t')v+=c.textContent;else if(c.localName==='tab')v+='\t';else if(c.localName==='br'||c.localName==='cr')v+='\n';else if(c.localName==='drawing'){
        const blip=at(c,'blip','http://schemas.openxmlformats.org/drawingml/2006/main'),id=blip?.getAttributeNS(R,'embed'),rel=rels[id];
        if(rel&&!rel.external){const path=normalize('word/'+rel.target);if(z[path]){const key='media/'+path.split('/').pop();resources[key]=new Blob([z[path]]);v+=`![](${key})`;}} }
      }
      const prop=first(r,'rPr');if(!v || v.startsWith('!['))return v;
      v=escapeMdLiteral(v);
      if(first(prop,'b')&&attr(first(prop,'b'),'val')!=='0')v='**'+v+'**';
      if(first(prop,'i')&&attr(first(prop,'i'),'val')!=='0')v='*'+v+'*';
      if(first(prop,'strike'))v='~~'+v+'~~';
      if(first(prop,'u')&&attr(first(prop,'u'),'val')!=='none')v='<u>'+v+'</u>';
      if((first(prop,'highlight')&&attr(first(prop,'highlight'),'val')==='yellow')||(first(prop,'shd')&&/^(fff2a8|ffff00)$/i.test(attr(first(prop,'shd'),'fill'))))v='=='+v+'==';
      const va=attr(first(prop,'vertAlign'),'val');
      if(va==='superscript')v='<sup>'+v+'</sup>';else if(va==='subscript')v='<sub>'+v+'</sub>';
      if(attr(first(prop,'rStyle'),'val')==='Code')v='`'+v+'`';
      return v;
    }
    function para(p){const pp=first(p,'pPr'),sty=attr(first(pp,'pStyle'),'val'),h=/^Heading([1-6])$/i.exec(sty),hl=/^heading ([1-6])$/i.exec(sty),num=first(pp,'numPr');let txt='';
      for(const c of p.children){if(c.localName==='r')txt+=textRun(c);else if(c.localName==='oMath' || c.localName==='oMathPara'){const raw=Array.from(c.getElementsByTagNameNS('http://schemas.openxmlformats.org/officeDocument/2006/math','t')).map(n=>n.textContent).join('');if(raw)txt+='$'+raw+'$';}
      else if(c.localName==='hyperlink'){
        const v=Array.from(c.children).filter(x=>x.localName==='r').map(textRun).join('');const rel=rels[c.getAttributeNS(R,'id')];txt+=(rel?.external&&rel.target)?`[${v}](${rel.target})`:v;
      }else if(c.localName==='sdt'){txt+=Array.from(c.getElementsByTagNameNS(W,'r')).map(textRun).join('');}}
      txt=txt.trim();if(!txt&&first(first(pp,'pBdr'),'bottom'))return {type:'hr'};if(!txt)return null; if(h||hl)return {type:'heading',level:Number((h||hl)[1]),text:txt};if(sty==='Quote')return {type:'quote',text:txt};if(sty==='Code')return {type:'code',text:decodeMdEscapes(txt)};if(sty==='TaskList'&&/^[☐☑]\s/.test(txt))return {type:'listitem',ordered:false,task:true,text:txt};
      if(num){const id=attr(first(first(pp,'numPr'),'numId'),'val'),fmt=numberFormats[id];
        return {type:'listitem',ordered:fmt?fmt!=='bullet':/number/i.test(sty),task:false,text:txt};}
      return {type:'p',text:txt};
    }
    for(const c of body.children){if(c.localName==='p'){const x=para(c);if(x){if(x.type==='listitem'){let b=blocks.at(-1);if(!b||b.type!=='list'||b.ordered!==x.ordered||!!b.task!==!!x.task){b={type:'list',ordered:x.ordered,task:!!x.task,items:[]};blocks.push(b);}b.items.push(x.text);}else blocks.push(x);}}
      else if(c.localName==='tbl'){const rows=[];for(const row of getChildren(c,'tr')){const cells=[];for(const cell of getChildren(row,'tc'))cells.push(getChildren(cell,'p').map(p=>para(p)?.text||'').join(' '));rows.push(cells);}
        const hdr=first(first(getChildren(c,'tr')[0],'trPr'),'tblHeader');
        const borderNode=first(first(c,'tblPr'),'tblBorders');
        const borders=!!borderNode&&Array.from(borderNode.children).some(x=>!['none','nil'].includes(attr(x,'val')));
        blocks.push({type:'table',rows,hasHeader:!!hdr&&attr(hdr,'val')!=='0',borders});}}
    return {blocks,resources};
  }
  function docxMake(blocks,resources={}){
    let linkId=10,imgId=100,links=[],assets={},mediaTypes={},hasNumber=false;
    const putRun=(t,style='')=>`<w:r>${style?`<w:rPr>${style}</w:rPr>`:''}${String(t).split(/(\n|\t)/).map(part=>part==='\n'?'<w:br/>':part==='\t'?'<w:tab/>':`<w:t xml:space="preserve">${esc(part)}</w:t>`).join('')}</w:r>`;
    function runInline(s){return inlineParts(s).map(v=>{
      switch(v.type){
        case 'bold':return putRun(v.text,'<w:b/>');case 'italic':return putRun(v.text,'<w:i/>');case 'strike':return putRun(v.text,'<w:strike/>');case 'code':return putRun(v.text,'<w:rStyle w:val="Code"/>');
        case 'math':return putRun('$'+v.text+'$');
        case 'underline':return putRun(v.text,'<w:u w:val="single"/>');
        case 'highlight':return putRun(v.text,'<w:highlight w:val="yellow"/>');
        case 'sup':return putRun(v.text,'<w:vertAlign w:val="superscript"/>');
        case 'sub':return putRun(v.text,'<w:vertAlign w:val="subscript"/>');
        case 'link':{const id=`rId${linkId++}`;links.push(`<Relationship Id="${id}" Type="${R}/hyperlink" Target="${esc(v.href)}" TargetMode="External"/>`);return `<w:hyperlink r:id="${id}">${putRun(v.text,'<w:color w:val="0563C1"/><w:u w:val="single"/>')}</w:hyperlink>`;}
        case 'image':{const name=normalize(v.href),file=resources[name],suffix=ext(name),mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif'}[suffix]);
          if(!file||!mime)return putRun('!['+v.text+']('+v.href+')');const id=`rId${imgId++}`,med=`media/image${imgId}.${suffix}`;assets[`word/${med}`]=file;mediaTypes[suffix]=mime;
          links.push(`<Relationship Id="${id}" Type="${R}/image" Target="${med}"/>`);
          return `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="3800000" cy="2500000"/><wp:docPr id="${imgId}" name="${esc(v.text||'画像')}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3800000" cy="2500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
        }
        default:return putRun(v.text);
      }
    }).join('');}
    const paragraph=(s,properties='')=>`<w:p>${properties?`<w:pPr>${properties}</w:pPr>`:''}${runInline(s)}</w:p>`;
    const out=[];
    for(const b of blocks){
      if(b.type==='heading')out.push(paragraph(b.text,`<w:pStyle w:val="Heading${b.level}"/>`));
      else if(b.type==='p')out.push(paragraph(b.text));
      else if(b.type==='quote')out.push(paragraph(b.text,'<w:pStyle w:val="Quote"/>'));
      else if(b.type==='list'){
         for(const t of b.items){
           if(/^[☐☑]\s/.test(t))out.push(paragraph(t,'<w:pStyle w:val="TaskList"/>'));
           else {hasNumber=true;out.push(paragraph(t,`<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${b.ordered?2:1}"/></w:numPr>`));}
         }
       }
      else if(b.type==='code')out.push(paragraph(b.text,'<w:pStyle w:val="Code"/>'));
      else if(b.type==='math')out.push(paragraph('$$ '+b.text+' $$'));
      else if(b.type==='hr')out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="888888"/></w:pBdr></w:pPr></w:p>');
      else if(b.type==='table')out.push(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${b.borders!==false?'<w:tblBorders><w:bottom w:val="single"/><w:top w:val="single"/><w:left w:val="single"/><w:right w:val="single"/><w:insideH w:val="single"/><w:insideV w:val="single"/></w:tblBorders>':''}</w:tblPr><w:tblGrid>${Array.from({length:Math.max(1,...b.rows.map(r=>r.length))},()=>'<w:gridCol w:w="2400"/>').join('')}</w:tblGrid>${b.rows.map((row,i)=>'<w:tr>'+(i===0&&b.hasHeader!==false?'<w:trPr><w:tblHeader w:val="1"/></w:trPr>':'')+row.map(cell=>`<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${paragraph(cell)}</w:tc>`).join('')+'</w:tr>').join('')}</w:tbl>`);
    }
    const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${out.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
    const styles=`<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${Array.from({length:6},(_,i)=>`<w:style w:type="paragraph" w:styleId="Heading${i+1}"><w:name w:val="heading ${i+1}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${i}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${Math.max(22,36-i*3)}"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="TaskList"><w:name w:val="Task checklist"/></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/></w:style></w:styles>`;
    const numbering=`<?xml version="1.0" encoding="UTF-8"?><w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;
    const types=`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${Object.entries(mediaTypes).map(([e,t])=>`<Default Extension="${e}" ContentType="${t}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${hasNumber?'<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>':''}</Types>`;
    const rels=`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${P}"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/>${hasNumber?`<Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/>`:''}${links.join('')}</Relationships>`;
    const files={'[Content_Types].xml':types,'_rels/.rels':`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${P}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`,'word/document.xml':document,'word/_rels/document.xml.rels':rels,'word/styles.xml':styles};if(hasNumber)files['word/numbering.xml']=numbering;
    for(const [k,v] of Object.entries(assets))files[k]=v instanceof Uint8Array?v:new Uint8Array();
    return {files,assets};
  }
  async function buildDocx(blocks,resources){const {files,assets}=docxMake(blocks,resources);for(const [key,blob] of Object.entries(assets))files[key]=new Uint8Array(await blob.arrayBuffer());return zipWrite(files);}
  function preview(blocks,host,resources={},urlList=[]){
    const element=(tag,text,into=host)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;into.append(n);return n;};
    function renderInline(s,into){for(const v of inlineParts(s)){let n;
      switch(v.type){case 'bold':n=element('strong',v.text,into);break;case 'italic':n=element('em',v.text,into);break;case 'strike':n=element('s',v.text,into);break;case 'underline':n=element('u',v.text,into);break;case 'highlight':n=element('mark',v.text,into);break;case 'sup':n=element('sup',v.text,into);break;case 'sub':n=element('sub',v.text,into);break;case 'code':n=element('code',v.text,into);break;case 'math':n=element('code',v.text,into);n.className='inline-math';break;
        case 'link':n=element('a',v.text,into);if(/^https?:\/\//i.test(v.href)){n.href=v.href;n.rel='noopener noreferrer';n.target='_blank';}break;
        case 'image':{const name=normalize(v.href),file=resources[name];if(file){n=element('img',null,into);n.alt=v.text;n.src=URL.createObjectURL(file);urlList.push(n.src);n.style.maxWidth='100%';}else element('span','!['+v.text+']('+v.href+')',into);break;}
        default:element('span',v.text,into);
      }}
    }
    host.replaceChildren();for(const b of blocks){let n;
      switch(b.type){case 'heading':n=element('h'+b.level);renderInline(b.text,n);break;case 'p':n=element('p');renderInline(b.text,n);break;case 'quote':n=element('blockquote');renderInline(b.text,n);break;case 'hr':element('hr');break;case 'math':n=element('pre');element('code',b.text,n);break;case 'code':n=element('pre');element('code',b.text,n);break;
        case 'list':n=element(b.ordered?'ol':'ul');for(const t of b.items){const li=element('li',null,n);if(/^[☐☑]\s/.test(t))li.className='task-item';renderInline(t,li);}break;
        case 'table':n=element('table');if(b.borders!==false)n.classList.add('bordered-table');for(let i=0;i<b.rows.length;i++){const tr=element('tr',null,n);for(const x of b.rows[i]){const c=element(i===0&&b.hasHeader!==false?'th':'td',null,tr);renderInline(x,c);}}break;
      }
    }
  }
  window.OfflineConverter={zipRead,zipWrite,mdBlocks,blocksToMarkdown,toTex,fromTex,docxRead,buildDocx,preview,normalize};
})();
