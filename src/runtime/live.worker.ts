/// <reference lib="webworker" />
/**
 * Live worker: runs the simulated plant in real time (× speed) and streams
 * telemetry + AquaTwin's live estimates to the interface at 1 Hz.
 */
import { loadBundle, type MlBundleJson } from "@/sim/ml";
import { TwinRuntime } from "./engine";
import type { LiveRequest, WorkerMessage } from "./protocol";
import { degradationFromJson } from "./shared";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let rt: TwinRuntime | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let last = 0;

const post = (m: WorkerMessage) => ctx.postMessage(m);

function startLoop() {
  if (timer) clearInterval(timer);
  last = performance.now();
  timer = setInterval(() => {
    if (!rt) return;
    const now = performance.now();
    const r = rt.tick(now - last);
    last = now;
    post({ type: "live", snapshot: r.snapshot, append: r.append });
  }, 1000);
}

ctx.onmessage = async (ev: MessageEvent<LiveRequest>) => {
  const req = ev.data;
  try {
    switch (req.type) {
      case "init": {
        const t0 = performance.now();
        const [ml, deg] = await Promise.all([
          fetch(`${req.origin}/data/models/aquatwin-ml.json`).then((r) => {
            if (!r.ok) throw new Error(`model bundle HTTP ${r.status}`);
            return r.json() as Promise<MlBundleJson>;
          }),
          fetch(`${req.origin}/data/models/degradation.json`).then((r) => r.json()),
        ]);
        const bundle = loadBundle(ml);
        rt = new TwinRuntime(bundle, degradationFromJson(deg));
        rt.setSpeed(req.speed);
        post({ type: "history", points: rt.history });
        const first = rt.tick(1000);
        post({ type: "live", snapshot: first.snapshot });
        post({ type: "ready", modelMeta: bundle.meta, loadMs: Math.round(performance.now() - t0) });
        startLoop();
        post({ type: "response", id: req.id, ok: true, data: null });
        break;
      }
      case "setSpeed":
        rt?.setSpeed(req.speed);
        post({ type: "response", id: req.id, ok: true, data: null });
        break;
      case "apply":
        rt?.applySetpoints(req.setpoints);
        post({ type: "response", id: req.id, ok: true, data: null });
        break;
      case "resetPlant":
        if (rt) {
          rt.reset();
          post({ type: "history", points: rt.history });
        }
        post({ type: "response", id: req.id, ok: true, data: null });
        break;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (req.type === "init") post({ type: "fatal", error: msg });
    post({ type: "response", id: req.id, ok: false, error: msg });
  }
};
