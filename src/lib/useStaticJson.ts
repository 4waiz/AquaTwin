"use client";
import { useEffect, useState } from "react";

const cache = new Map<string, unknown>();

/** Fetch a static JSON artefact once per session; `missing` is true on 404. */
export function useStaticJson<T>(url: string) {
  const [data, setData] = useState<T | null>((cache.get(url) as T) ?? null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (cache.has(url)) return;
    let alive = true;
    fetch(url)
      .then(async (r) => {
        if (r.status === 404) {
          if (alive) setMissing(true);
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as T;
        cache.set(url, j);
        if (alive) setData(j);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [url]);
  return { data, missing, error };
}
