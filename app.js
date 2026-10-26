import DOMPurify from "dompurify";
import katex from "katex";
import { zipSync, unzipSync, strToU8 } from "fflate";
const $ = (id) => document.getElementById(id);
const example = String.raw`# 文書のサンプル

Markdown・Word・TeXの間で、文書の構造を変換します。

## 文字とリスト

**太字**、*斜体*、~~取り消し線~~、§インラインコード§。

- 箇条書き
  - 入れ子の項目
- [x] 確認済み
- [ ] 未確認

1. 文書を入力
2. 形式を選択
3. 変換して保存

> 引用文は引用のスタイルに対応します。

## 数式

行内の数式 $E = mc^2$ と、別行立ての数式。

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

## 表

| 項目 | 記法 | 変換先 |
| :--- | :--- | :--- |
| 見出し | # | 見出し1 |
| 数式 | $$ … $$ | Wordの数式 |
| 表 | パイプ区切り | Wordの表 |

## コード・脚注

~~~python
def square(x):
    return x ** 2
~~~

[Pandoc](https://pandoc.org)による変換です。脚注も使えます。[^1]

[^1]: これは脚注です。

---
`.replaceAll("§", "`");
let inputFile = null,
  resources = {},
  reference = null,
  result = null,
  resultTo = null,
  baseName = "document",
  worker = null,
  isReady = false,
  busy = false,
  urls = [],
  timer = null;
function status(message, kind = "") {
  $("status").textContent = message;
  $("status").className = kind;
}

function releasePreviewUrls() {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
}

function invalidate() {
  result = null;
  resultTo = null;
  $("download").disabled = true;
  $("copy").disabled = true;
  $("source-tab").disabled = true;
  $("preview").hidden = true;
  $("source").hidden = true;
  $("empty").hidden = false;
  $("result-meta").textContent = "—";
  $("warnings").hidden = true;
  releasePreviewUrls();
  showTab(false);
}
function setBusy(value) {
  busy = value;
  document.body.classList.toggle("busy", value);
  $("cancel").hidden = !value;
  for (const id of [
    "from",
    "to",
    "swap",
    "open",
    "choose-docx",
    "sample",
    "clear",
    "add-resources",
    "add-reference",
    "standalone",
    "remove-resources",
    "remove-reference",
  ])
    $(id).disabled = value;
  $("editor").readOnly = value;
  $("convert").disabled = value || !isReady;
}
function startWorker() {
  isReady = false;
  $("convert").disabled = true;
  status("変換エンジンを準備中…（初回は約15 MBを読み込みます）");
  worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    if (data.type === "ready") {
      isReady = true;
      $("convert").disabled = busy;
      status("準備完了");
    }
    if (data.type === "result") {
      clearTimeout(timer);
      setBusy(false);
      renderResult(data.result).catch((e) => {
        invalidate();
        status(e.message, "error");
      });
    }
    if (data.type === "error") {
      clearTimeout(timer);
      setBusy(false);
      status(data.message, "error");
      if (!isReady) {
        $("convert").disabled = false;
        $("convert").textContent = "再試行";
      }
    }
  };
  worker.onerror = () => {
    clearTimeout(timer);
    setBusy(false);
    status("変換エンジンでエラーが発生しました。再試行してください。", "error");
    isReady = false;
    $("convert").disabled = false;
    $("convert").textContent = "再試行";
  };
}
function updateInput() {
  const word = $("from").value === "docx";
  $("editor").hidden = word;
  $("docx-input").hidden = !word;
  $("sample").hidden = word;
  $("editor").placeholder =
    $("from").value === "latex"
      ? "\\section{見出し}\n\nここにTeXを入力"
      : "# 見出し\n\nここにMarkdownを入力";
  $("docx-name").textContent = inputFile?.name || "Wordファイルを選択";
  $("docx-size").textContent = inputFile
    ? `${(inputFile.size / 1024).toFixed(1)} KB`
    : ".docxをここにドロップ";
  $("input-meta").textContent = word
    ? inputFile
      ? "Word .docx"
      : "ファイル未選択"
    : `${$("editor").value.length.toLocaleString()} 文字`;
}
function showTab(source) {
  $("source").hidden = !source || !result;
  $("preview").hidden = source || !result;
  $("preview-tab").classList.toggle("active", !source);
  $("source-tab").classList.toggle("active", source);
  $("preview-tab").setAttribute("aria-selected", String(!source));
  $("source-tab").setAttribute("aria-selected", String(source));
}
function safePath(name) {
  const n = name.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    n.startsWith("/") ||
    n.split("/").includes("..") ||
    /^[A-Za-z]:/.test(n) ||
    ["__proto__", "prototype", "constructor"].includes(n)
  )
    throw Error("関連ファイルのパスが不正です。");
  return n;
}
async function importFile(file) {
  if (busy) return;
  if (file.size > 30 * 1024 * 1024)
    throw Error("入力ファイルは30 MB以下にしてください。");
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["md", "markdown", "txt", "tex", "latex", "docx"].includes(ext))
    throw Error(".md、.tex、.docxを選択してください。");
  invalidate();
  baseName = file.name.replace(/\.[^.]+$/, "");
  if (ext === "docx") {
    inputFile = file;
    $("from").value = "docx";
    if ($("to").value === "docx") $("to").value = "markdown";
  } else {
    inputFile = null;
    $("from").value = ["tex", "latex"].includes(ext) ? "latex" : "markdown";
    $("editor").value = await file.text();
    if ($("to").value === $("from").value) $("to").value = "docx";
  }
  updateInput();
  status(`${file.name} を読み込みました`);
}
async function renderResult(data) {
  result = data;
  resultTo = $("to").value;
  releasePreviewUrls();
  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(data.html, {
      FORBID_TAGS: ["style", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["style", "srcset"],
    }),
    "text/html",
  );
  for (const img of doc.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    let asset = data.assets[src] || data.assets[decodeURIComponent(src || "")];
    if (asset) {
      const ext = (src || "").split(".").pop().toLowerCase();
      const mime = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
      }[ext];
      if (mime) {
        const url = URL.createObjectURL(new Blob([asset], { type: mime }));
        urls.push(url);
        img.src = url;
      } else {
        img.removeAttribute("src");
      }
    } else if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src || "")) {
      img.removeAttribute("src");
      img.alt = img.alt || "画像ファイル未指定";
    }
  }
  for (const a of doc.querySelectorAll("a")) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  $("preview").replaceChildren(...doc.body.childNodes);
  for (const math of $("preview").querySelectorAll(".math")) {
    const display = math.classList.contains("display");
    const latex = math.textContent.replace(/^\\[([]|\\[)\]]$/g, "");
    try {
      katex.render(latex, math, {
        displayMode: display,
        throwOnError: false,
        trust: false,
        strict: false,
      });
    } catch {}
  }
  $("source").value = data.text;
  $("source-tab").disabled = resultTo === "docx";
  $("copy").disabled = resultTo === "docx";
  $("download").disabled = false;
  $("empty").hidden = true;
  $("result-meta").textContent =
    `${{ docx: "Word .docx", markdown: "Markdown .md", latex: "TeX .tex" }[resultTo]} · ${(data.blob.size / 1024).toFixed(1)} KB`;
  const notices = [...data.notices];
  $("warnings").hidden = !notices.length;
  $("warning-text").textContent = notices.join("\n\n");
  showTab(false);
  status(
    notices.length
      ? "変換しました。注意事項を確認してください。"
      : "変換しました",
    "success",
  );
}
function convert() {
  if (!isReady) {
    worker?.terminate();
    startWorker();
    $("convert").innerHTML = '変換 <span aria-hidden="true">→</span>';
    return;
  }
  if ($("from").value === "docx" ? !inputFile : !$("editor").value.trim()) {
    status("変換する文書を入力してください。", "error");
    return;
  }
  invalidate();
  setBusy(true);
  status("変換中…");
  worker.postMessage({
    from: $("from").value,
    to: $("to").value,
    text: $("editor").value,
    input: inputFile,
    resources,
    reference,
    standalone: $("standalone").checked,
  });
  timer = setTimeout(() => {
    worker.terminate();
    setBusy(false);
    isReady = false;
    $("convert").disabled = false;
    status(
      "変換がタイムアウトしました。文書を小さくして再試行してください。",
      "error",
    );
  }, 90000);
}
$("convert").onclick = convert;
$("cancel").onclick = () => {
  clearTimeout(timer);
  worker.terminate();
  setBusy(false);
  startWorker();
};
$("from").onchange = () => {
  invalidate();
  updateInput();
};
$("to").onchange = () => invalidate();
$("standalone").onchange = invalidate;
$("editor").oninput = () => {
  invalidate();
  updateInput();
};
$("editor").onkeydown = (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const a = e.target.selectionStart,
      b = e.target.selectionEnd;
    e.target.setRangeText("  ", a, b, "end");
    invalidate();
    updateInput();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    if (!busy) convert();
  }
};
$("sample").onclick = () => {
  invalidate();
  baseName = "sample";
  $("editor").value =
    $("from").value === "latex"
      ? String.raw`\section{文書のサンプル}

\subsection{数式}
行内の数式 $E=mc^2$ と、別行立ての数式。
\[
\int_0^1 x^2\,dx = \frac{1}{3}
\]

\subsection{リスト}
\begin{itemize}
\item \textbf{太字}
\item \emph{斜体}
\end{itemize}
`
      : example;
  updateInput();
  status("サンプルを読み込みました");
};
$("clear").onclick = () => {
  invalidate();
  $("editor").value = "";
  inputFile = null;
  baseName = "document";
  updateInput();
  status("入力をクリアしました");
};
for (const id of ["open", "choose-docx"])
  $(id).onclick = () => $("file").click();
$("file").onchange = async (e) => {
  try {
    if (e.target.files[0]) await importFile(e.target.files[0]);
  } catch (err) {
    status(err.message, "error");
  }
  e.target.value = "";
};
for (const name of ["dragenter", "dragover"])
  $("drop-area").addEventListener(name, (e) => {
    e.preventDefault();
    $("drop-area").classList.add("drag");
  });
for (const name of ["dragleave", "drop"])
  $("drop-area").addEventListener(name, (e) => {
    e.preventDefault();
    $("drop-area").classList.remove("drag");
  });
$("drop-area").addEventListener("drop", async (e) => {
  try {
    if (e.dataTransfer.files[0]) await importFile(e.dataTransfer.files[0]);
  } catch (err) {
    status(err.message, "error");
  }
});
$("add-resources").onclick = () => $("resources").click();
$("resources").onchange = async (e) => {
  try {
    let next = { ...resources };
    for (const file of e.target.files) {
      if (file.size > 30 * 1024 * 1024)
        throw Error("関連ファイルは30 MB以下にしてください。");
      if (/\.zip$/i.test(file.name)) {
        let total = 0;
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
          filter: (entry) => {
            total += entry.originalSize;
            if (total > 60 * 1024 * 1024)
              throw Error("ZIPの展開後サイズは60 MB以下にしてください。");
            return !entry.name.endsWith("/");
          },
        });
        for (const [name, bytes] of Object.entries(entries))
          next[safePath(name)] = new Blob([bytes]);
      } else next[safePath(file.name)] = file;
    }
    resources = next;
    invalidate();
    $("resource-count").textContent =
      `${Object.keys(resources).length} ファイル`;
    $("remove-resources").hidden = false;
    status("関連ファイルを追加しました");
  } catch (err) {
    status(err.message, "error");
  }
  e.target.value = "";
};
$("remove-resources").onclick = () => {
  resources = {};
  invalidate();
  $("resource-count").textContent = "未選択";
  $("remove-resources").hidden = true;
};
$("add-reference").onclick = () => $("reference").click();
$("reference").onchange = (e) => {
  const f = e.target.files[0];
  if (f) {
    if (!/\.docx$/i.test(f.name) || f.size > 30 * 1024 * 1024) {
      status("30 MB以下の.docxを指定してください。", "error");
      return;
    }
    reference = f;
    invalidate();
    $("reference-name").textContent = f.name;
    $("remove-reference").hidden = false;
  }
  e.target.value = "";
};
$("remove-reference").onclick = () => {
  reference = null;
  invalidate();
  $("reference-name").textContent = "標準";
  $("remove-reference").hidden = true;
};
$("preview-tab").onclick = () => showTab(false);
$("source-tab").onclick = () => showTab(true);
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(result.text);
    status("コピーしました", "success");
  } catch {
    showTab(true);
    $("source").select();
    status("ソースを選択しました。Ctrl+Cでコピーしてください。");
  }
};
function save(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$("download").onclick = async () => {
  try {
    const ext = { docx: "docx", markdown: "md", latex: "tex" }[resultTo],
      filename = `${baseName}.${ext}`;
    const assets = Object.entries(result.assets).filter(
      ([name]) => name !== "reference.docx",
    );
    if (resultTo !== "docx" && assets.length) {
      const pack = { [filename]: strToU8(result.text) };
      for (const [name, blob] of assets)
        pack[safePath(name)] =
          typeof blob === "string"
            ? strToU8(blob)
            : new Uint8Array(await blob.arrayBuffer());
      save(new Blob([zipSync(pack)]), `${baseName}.zip`);
    } else save(result.blob, filename);
    status("ダウンロードしました", "success");
  } catch (err) {
    status(err.message, "error");
  }
};
$("swap").onclick = () => {
  if (!result) {
    status("変換後に押すと、結果を入力として逆変換できます。");
    return;
  }
  const oldFrom = $("from").value;
  const nextTo = resultTo;
  const previous = result;
  resources = { ...previous.assets };
  delete resources["reference.docx"];
  $("resource-count").textContent = Object.keys(resources).length
    ? `${Object.keys(resources).length} ファイル`
    : "未選択";
  $("remove-resources").hidden = !Object.keys(resources).length;
  $("from").value = nextTo;
  $("to").value = oldFrom;
  if (nextTo === "docx")
    inputFile = new File([previous.blob], `${baseName}.docx`);
  else {
    $("editor").value = previous.text;
    inputFile = null;
  }
  invalidate();
  updateInput();
  status("変換結果を入力にしました");
};
$("help").onclick = () => $("help-dialog").showModal();
$("close-help").onclick = () => $("help-dialog").close();
$("help-dialog").onclick = (e) => {
  if (e.target === $("help-dialog")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
};
$("editor").value = example;
updateInput();
startWorker();
