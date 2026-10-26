export const MARKDOWN =
  "markdown+tex_math_dollars+pipe_tables+strikeout+task_lists+footnotes+fenced_code_blocks-raw_html";
export const MD_OUT =
  "markdown+tex_math_dollars+pipe_tables+strikeout+task_lists+footnotes-simple_tables-multiline_tables-grid_tables";
export async function transform(convert, job) {
  const {
    from,
    to,
    text,
    input,
    resources = {},
    reference,
    standalone = true,
  } = job;
  const files = { ...resources };
  const opts = {
    from: from === "markdown" ? MARKDOWN : from,
    to: "json",
    "extract-media": "media",
    wrap: "none",
  };
  let stdin = text;
  if (from === "docx") {
    files["source.docx"] = input;
    opts["input-files"] = ["source.docx"];
    stdin = null;
  }
  const parsed = await convert(opts, stdin, files);
  let ast;
  try {
    ast = JSON.parse(parsed.stdout);
  } catch {
    throw Error(
      parsed.stderr ||
        "文書を読み込めませんでした。形式と内容を確認してください。",
    );
  }
  const assets = { ...resources, ...parsed.mediaFiles };
  const notices = [];
  let raw = 0;
  function inspect(node) {
    if (!node || typeof node !== "object") return;
    if (node.t === "RawBlock" || node.t === "RawInline") raw++;
    if (node.t === "Image" && /^(https?:|\/\/)/i.test(node.c?.[2]?.[0] || ""))
      notices.push(
        "外部URLの画像は取得しません。画像ファイルを追加し、相対パスで指定してください。",
      );
    for (const v of Object.values(node)) if (typeof v === "object") inspect(v);
  }
  inspect(ast);
  if (raw)
    notices.push(
      "独自のTeX命令や生のマークアップは、変換先によって保持されない場合があります。",
    );
  const filename =
    to === "docx"
      ? "document.docx"
      : to === "latex"
        ? "document.tex"
        : "document.md";
  const outOpts = {
    from: "json",
    to: to === "markdown" ? MD_OUT : to,
    "output-file": filename,
    wrap: "none",
    standalone: to === "latex" ? standalone : true,
  };
  if (to === "latex") {
    outOpts.variables = { documentclass: "ltjsarticle" };
    outOpts["pdf-engine"] = "lualatex";
  }
  if (to === "docx" && reference) {
    assets["reference.docx"] = reference;
    outOpts["reference-doc"] = "reference.docx";
  }
  const output = await convert(outOpts, JSON.stringify(ast), assets);
  const blob = output.files[filename];
  if (!blob?.size)
    throw Error(output.stderr || "変換結果を生成できませんでした。");
  const preview = await convert(
    {
      from: "json",
      to: "html5",
      "html-math-method": { method: "katex" },
      wrap: "none",
    },
    JSON.stringify(ast),
    assets,
  );
  for (const r of [parsed, output, preview]) {
    if (r.stderr?.trim()) notices.push(r.stderr.trim());
    for (const warning of r.warnings || [])
      if (warning.verbosity !== "INFO")
        notices.push(
          typeof warning === "string"
            ? warning
            : warning.pretty || JSON.stringify(warning),
        );
  }
  return {
    blob,
    text: to === "docx" ? "" : await blob.text(),
    html: preview.stdout,
    assets,
    filename,
    notices: [...new Set(notices)],
  };
}
