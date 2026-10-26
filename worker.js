import { createPandocInstance } from "./pandoc-core.js";
import { transform } from "./engine.js";
let engine;
async function init() {
  const response = await fetch("./pandoc.wasm.gz");
  if (!response.ok)
    throw Error("変換エンジンを読み込めませんでした。再試行してください。");
  const bytes = await new Response(
    response.body.pipeThrough(new DecompressionStream("gzip")),
  ).arrayBuffer();
  engine = await createPandocInstance(bytes);
  postMessage({ type: "ready" });
}
const ready = init();
ready.catch((e) => postMessage({ type: "error", message: e.message }));
onmessage = async ({ data }) => {
  try {
    await ready;
    postMessage({
      type: "result",
      result: await transform(engine.convert, data),
    });
  } catch (e) {
    postMessage({ type: "error", message: e.message });
  }
};
