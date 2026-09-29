"use client";
/**
 * Browser-side client for the two twin workers. A single instance per page
 * load; state is exposed through zustand stores in src/state.
 */

import type { ObjectiveWeights } from "@/sim/optimizer";
import type { ScenarioId } from "@/sim/scenarios";
import type {
  ComputeRequest,
  EnvelopeGrid,
  LiveRequest,
  LiveSnapshot,
  LiveStateMsg,
  OptimizationSnapshot,
  ProbeInput,
  ProbeResult,
  ScenarioResult,
  WorkerMessage,
} from "./protocol";
import type { TrainSetpoint } from "@/sim/types";
import { useLive } from "@/state/live";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

class TwinClient {
  private live: Worker | null = null;
  private compute: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private started = false;
  private computeReady: Promise<unknown> | null = null;

  start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    const store = useLive.getState();
    store.setStatus("loading");
    try {
      this.live = new Worker(new URL("./live.worker.ts", import.meta.url), { type: "module", name: "aquatwin-live" });
      this.compute = new Worker(new URL("./compute.worker.ts", import.meta.url), { type: "module", name: "aquatwin-compute" });
    } catch (e) {
      store.setStatus("error", e instanceof Error ? e.message : String(e));
      return;
    }
    this.live.onmessage = (ev: MessageEvent<WorkerMessage>) => this.onMessage(ev.data);
    this.compute.onmessage = (ev: MessageEvent<WorkerMessage>) => this.onMessage(ev.data);
    this.live.onerror = (ev) => useLive.getState().setStatus("error", ev.message || "live worker failed");
    const origin = window.location.origin;
    void this.send(this.live, { type: "init", origin, speed: useLive.getState().speed }).catch((e) => useLive.getState().setStatus("error", String(e)));
    this.computeReady = this.send(this.compute, { type: "init", origin });
  }

  private onMessage(m: WorkerMessage) {
    const store = useLive.getState();
    switch (m.type) {
      case "ready":
        store.setReady(m.modelMeta, m.loadMs);
        break;
      case "live":
        store.pushSnapshot(m.snapshot, m.append);
        break;
      case "history":
        store.setHistory(m.points);
        break;
      case "fatal":
        store.setStatus("error", m.error);
        break;
      case "response": {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.ok) p.resolve(m.data);
        else p.reject(new Error(m.error));
        break;
      }
    }
  }

  private send<T>(worker: Worker | null, req: DistributiveOmit<LiveRequest | ComputeRequest, "id">): Promise<T> {
    if (!worker) return Promise.reject(new Error("worker unavailable"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ ...req, id });
    });
  }

  private liveState(): LiveStateMsg {
    const s = useLive.getState().snapshot as LiveSnapshot | null;
    if (!s) throw new Error("live plant not ready");
    return {
      simTime: s.simTime,
      setpoints: s.setpoints,
      reservoirFraction: s.reservoirFraction,
      health: s.health.map((h) => h.npf),
      contexts: s.contexts,
    };
  }

  private async whenLive(): Promise<void> {
    if (useLive.getState().snapshot) return;
    await new Promise<void>((resolve) => {
      const unsub = useLive.subscribe((st) => {
        if (st.snapshot) {
          unsub();
          resolve();
        }
      });
    });
  }

  async scenario(scenario: ScenarioId, weights?: ObjectiveWeights, force = false): Promise<ScenarioResult> {
    await this.computeReady;
    await this.whenLive();
    return this.send<ScenarioResult>(this.compute, { type: "scenario", live: this.liveState(), scenario, weights, force });
  }

  async optimize(source: ScenarioId | "live", t: number, weights?: ObjectiveWeights): Promise<OptimizationSnapshot> {
    await this.computeReady;
    await this.whenLive();
    return this.send<OptimizationSnapshot>(this.compute, { type: "optimize", live: this.liveState(), source, t, weights });
  }

  async probe(input: ProbeInput): Promise<ProbeResult> {
    await this.computeReady;
    return this.send<ProbeResult>(this.compute, { type: "probe", input });
  }

  async envelope(resolution = 36): Promise<EnvelopeGrid> {
    await this.computeReady;
    await this.whenLive();
    return this.send<EnvelopeGrid>(this.compute, { type: "envelope", live: this.liveState(), resolution });
  }

  setSpeed(speed: number) {
    useLive.getState().setSpeedLocal(speed);
    void this.send(this.live, { type: "setSpeed", speed });
  }

  apply(setpoints: TrainSetpoint[]) {
    return this.send(this.live, { type: "apply", setpoints });
  }

  resetPlant() {
    return this.send(this.live, { type: "resetPlant" });
  }
}

export const twinClient = new TwinClient();
