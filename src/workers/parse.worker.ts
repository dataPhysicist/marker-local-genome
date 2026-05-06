import { parseRawGenotypes } from "../lib/parse23andme";

export interface ParseWorkerMessage {
  type: "parse";
  text: string;
}

self.onmessage = (ev: MessageEvent<ParseWorkerMessage>) => {
  if (ev.data?.type !== "parse") return;
  try {
    const { qc, variants } = parseRawGenotypes(ev.data.text);
    self.postMessage({ ok: true, qc, variants });
  } catch (e) {
    self.postMessage({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
