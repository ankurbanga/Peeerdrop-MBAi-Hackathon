"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
export function useResource<T>(path: string | null, interval = 5000) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    sequence = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const request = ++sequence.current;
    try {
      const result = await api<T>(path);
      if (request === sequence.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (live && document.visibilityState === "visible") void reload();
    };
    setData(null);
    setError("");
    void reload();
    const timer = interval ? setInterval(refresh, interval) : null;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      live = false;
      sequence.current++;
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload, interval]);
  return { data, error, reload };
}
