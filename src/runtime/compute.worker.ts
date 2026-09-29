/// <reference lib="webworker" />
/**
 * Compute worker: scenario forecasts, optimisation snapshots, what-if probes
 * and the operating-envelope grid. Seeded with the latest live plant state on
 * every request so forecasts always start from "now".
 */
import { loadBundle, type MlBundleJson } from "@/sim/ml";
import { ComputeRuntime } from "./engine";
import type { ComputeRequest, WorkerMessage } from "./protocol";
import { degradationFromJson } from "./shared";

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let rt: ComputeRuntime | null = null;
let ready: Promise<void> | null = null;

const post = (m: WorkerMessage) => ctx.postMessage(m);

ctx.onmessage = async (ev: MessageEvent<ComputeRequest>) => {
  const req = ev.data;
  try {
    if (req.type === "init") {
      ready = (async () => {
        const [ml, deg] = await Promise.all([
          fetch(`${req.origin}/data/models/aquatwin-ml.json`).then((r) => {
            if (!r.ok) throw new Error(`model bundle HTTP ${r.status}`);
            return r.json() as Promise<MlBundleJson>;
          }),
          fetch(`${req.origin}/data/models/degradation.json`).then((r) => r.json()),
        ]);
        rt = new ComputeRuntime(loadBundle(ml), degradationFromJson(deg));
      })();
      await ready;
      post({ type: "response", id: req.id, ok: true, data: null });
      return;
    }
    if (!ready) throw new Error("compute worker not initialised");
    await ready;
    const r = rt!;
    let data: unknown;
    switch (req.type) {
      case "scenario":
        data = r.runScenarioLab(req.live, req.scenario, req.weights, req.force);
        break;
      case "optimize":
        data = r.optimizeAt(req.live, req.source, req.t, req.weights);
        break;
      case "probe":
        data = r.probe(req.input);
        break;
      case "envelope":
        data = r.envelope(req.live, req.resolution);
        break;
    }
    post({ type: "response", id: req.id, ok: true, data });
  } catch (e) {
    post({ type: "response", id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
