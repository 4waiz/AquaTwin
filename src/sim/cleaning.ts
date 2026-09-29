/**
 * Membrane cleaning criteria (docs/MODEL.md §5.1), after the FilmTec manual
 * [ref:DUPONT-MANUAL]: elements should be cleaned when
 *   the normalised permeate flow drops 10 %, or
 *   the normalised salt passage increases 5–10 %, or
 *   the normalised pressure drop increases 10–15 %.
 * AquaTwin treats the upper end of each range as "cleaning due" and the lower
 * end as "approaching". Only the flow criterion is forecast in time.
 */

import { LIMITS } from "./config";

export const CLEANING = {
  npfDue: LIMITS.cipHealthThreshold, // 0.90
  nspWatch: 1.05,
  nspDue: 1.1,
  ndpWatch: 1.1,
  ndpDue: 1.15,
} as const;

export interface CleaningStatus {
  due: boolean;
  approaching: boolean;
  /** Criteria met, most severe first, e.g. "pressure drop +25 %". */
  reasons: string[];
  /** Short label for cards and inspectors. */
  label: string;
}

const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(0)} %`;

export function cleaningStatus(npf: number, nsp: number, ndp: number, hoursToFlowCriterion: number | null): CleaningStatus {
  const reasons: string[] = [];
  if (npf <= CLEANING.npfDue) reasons.push(`flow ${pct(npf - 1)}`);
  if (ndp >= CLEANING.ndpDue) reasons.push(`pressure drop ${pct(ndp - 1)}`);
  if (nsp >= CLEANING.nspDue) reasons.push(`salt passage ${pct(nsp - 1)}`);
  if (reasons.length) return { due: true, approaching: false, reasons, label: `Cleaning due · ${reasons[0]}` };
  const approaching = ndp >= CLEANING.ndpWatch || nsp >= CLEANING.nspWatch;
  if (hoursToFlowCriterion !== null && hoursToFlowCriterion < 72) return { due: false, approaching: true, reasons, label: "Fouling trend detected" };
  if (approaching) return { due: false, approaching: true, reasons, label: "Approaching cleaning criteria" };
  return { due: false, approaching: false, reasons, label: "Healthy" };
}
