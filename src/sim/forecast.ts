/**
 * Degradation forecasting (docs/MODEL.md §6.3).
 *
 * Ordinary least squares on a recent window of the health signal gives the
 * degradation trend and its standard error. The time to the cleaning
 * threshold is reported as a 90 % band from the confidence band of the fitted
 * line, together with the probability that the threshold is crossed within a
 * horizon, obtained from the sampling distribution of the slope.
 */

export interface TrendFit {
  n: number;
  slope: number; // per hour
  intercept: number; // value at t = tMean
  tMean: number;
  sxx: number;
  residualStd: number;
  seSlope: number;
  r2: number;
}

export function fitTrend(ts: number[], ys: number[]): TrendFit | null {
  const n = ts.length;
  if (n < 4) return null;
  let tm = 0;
  let ym = 0;
  for (let i = 0; i < n; i++) {
    tm += ts[i];
    ym += ys[i];
  }
  tm /= n;
  ym /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dt = ts[i] - tm;
    const dy = ys[i] - ym;
    sxx += dt * dt;
    sxy += dt * dy;
    syy += dy * dy;
  }
  if (sxx <= 0) return null;
  const slope = sxy / sxx;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const e = ys[i] - (ym + slope * (ts[i] - tm));
    sse += e * e;
  }
  const residualStd = Math.sqrt(sse / Math.max(n - 2, 1));
  return {
    n,
    slope,
    intercept: ym,
    tMean: tm,
    sxx,
    residualStd,
    seSlope: residualStd / Math.sqrt(sxx),
    r2: syy > 0 ? 1 - sse / syy : 0,
  };
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export interface ThresholdForecast {
  status: "stable" | "declining" | "crossed";
  /** Central estimate, hours from now. */
  hours: number | null;
  lo: number | null;
  hi: number | null;
  /** P(crossing within `horizon_h`). */
  probWithin: number;
  horizon_h: number;
  slopePctPerHour: number;
  r2: number;
}

export function forecastThreshold(fit: TrendFit | null, tNow: number, current: number, threshold: number, horizon_h = 24, maxScan_h = 240): ThresholdForecast {
  const empty: ThresholdForecast = {
    status: "stable",
    hours: null,
    lo: null,
    hi: null,
    probWithin: 0,
    horizon_h,
    slopePctPerHour: fit ? fit.slope * 100 : 0,
    r2: fit?.r2 ?? 0,
  };
  if (current <= threshold) return { ...empty, status: "crossed", hours: 0, lo: 0, hi: 0, probWithin: 1 };
  if (!fit || fit.slope >= 0) return empty;
  const yAt = (t: number) => fit.intercept + fit.slope * (t - fit.tMean);
  const se = (t: number) => fit.residualStd * Math.sqrt(1 / fit.n + ((t - fit.tMean) * (t - fit.tMean)) / fit.sxx);
  const z = 1.645;
  let hours: number | null = null;
  let lo: number | null = null;
  let hi: number | null = null;
  const step = 0.1;
  for (let h = 0; h <= maxScan_h; h += step) {
    const t = tNow + h;
    const y = yAt(t);
    const s = se(t);
    if (lo === null && y - z * s <= threshold) lo = h;
    if (hours === null && y <= threshold) hours = h;
    if (hi === null && y + z * s <= threshold) {
      hi = h;
      break;
    }
  }
  // Probability of crossing within horizon from the slope's sampling distribution.
  const needed = (threshold - yAt(tNow)) / horizon_h; // slope required to cross in time
  const probWithin = fit.seSlope > 0 ? normCdf((needed - fit.slope) / fit.seSlope) : fit.slope <= needed ? 1 : 0;
  return {
    status: "declining",
    hours,
    lo,
    hi,
    probWithin,
    horizon_h,
    slopePctPerHour: fit.slope * 100,
    r2: fit.r2,
  };
}
