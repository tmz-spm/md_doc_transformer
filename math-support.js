import katex from 'katex';
import { mml2omml } from 'mathml2omml';
import omml2mathml from 'omml2mathml';
import { MathMLToLaTeX } from 'mathml-to-latex';

const options = display => ({ displayMode: display, throwOnError: true, trust: false,
  strict: 'ignore', maxExpand: 1000, maxSize: 20 });
export function render(tex, host, display = false) {
  host.classList.add('math');
  try {
    katex.render(tex, host, options(display));
    host.classList.remove('math-error'); host.removeAttribute('title');
  } catch (error) {
    host.replaceChildren(); host.textContent = display ? `$$\n${tex}\n$$` : `$${tex}$`;
    host.classList.add('math-error'); host.title = `数式を表示できません: ${error.message}`;
  }
}
export function toOmml(tex, display = false) {
  const markup = katex.renderToString(tex, { ...options(display), output: 'mathml' });
  const mathml = markup.match(/<math\b[\s\S]*<\/math>/)?.[0]
    .replace(/<annotation\b[\s\S]*?<\/annotation>/g, '');
  if (!mathml) throw Error('数式のMathMLを生成できません');
  const result = mml2omml(mathml, { disableDecode: true });
  if (!result.includes('<m:oMath')) throw Error('Word数式を生成できません');
  return display ? `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${result}</m:oMathPara>` : result;
}
export function fromOmml(node) {
  const mathml = omml2mathml(node);
  const tex = MathMLToLaTeX.convert(new XMLSerializer().serializeToString(mathml));
  if (!tex.trim()) throw Error('Word数式を読み取れません');
  // Check that the generated TeX can actually be displayed/exported by the same pipeline.
  katex.renderToString(tex, { ...options(node.localName === 'oMathPara'), output: 'mathml' });
  return tex;
}
