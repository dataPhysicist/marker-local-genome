import type { ParseWorkerResult } from "./types";

export function runParseWorker(text: string): Promise<ParseWorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/parse.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (
      ev: MessageEvent<{ ok: true; qc: ParseWorkerResult["qc"]; variants: ParseWorkerResult["variants"] } | { ok: false; error: string }>,
    ) => {
      worker.terminate();
      const d = ev.data;
      if (d.ok) resolve({ qc: d.qc, variants: d.variants });
      else reject(new Error(d.error));
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ type: "parse", text });
  });
}
