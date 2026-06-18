/// <reference lib="webworker" />
// Web Worker for heavy DSP analysis. Keeps the main thread responsive while
// FFT / BPM / chroma run on multi-MB tracks.

import { runDspAnalysis, type FileMeta } from "../lib/audio-analysis";

interface AnalyzeMessage {
  type: "analyze";
  channels: Float32Array[];
  sampleRate: number;
  fileMeta: FileMeta;
}

self.onmessage = (event: MessageEvent<AnalyzeMessage>) => {
  const msg = event.data;
  if (!msg || msg.type !== "analyze") return;
  try {
    const result = runDspAnalysis(
      msg.channels,
      msg.sampleRate,
      msg.fileMeta,
      (pct, label) => {
        (self as unknown as Worker).postMessage({ type: "progress", pct, label });
      },
    );
    (self as unknown as Worker).postMessage({ type: "result", result });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Analysis failed",
    });
  }
};

export {};
