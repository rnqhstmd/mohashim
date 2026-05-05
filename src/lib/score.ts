import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

export type LiveState =
  | "focused"
  | "calm"
  | "distracted"
  | "covering"
  | "stressed";
export type Grace = "active" | "looking" | "gone";
export type Phase = "idle" | "focus" | "break" | "complete" | "discarded";

export type ScoreSnapshot = {
  total: number;
  work: number;
  noise: number;
  state: LiveState;
  db: number;
  secondsIdle: number;
  grace: Grace;
  phase: Phase;
  timeLeft: number;
};

export const SCORE_TICK_EVENT = "score-tick";

export function useScoreTick(): ScoreSnapshot | null {
  const [snap, setSnap] = useState<ScoreSnapshot | null>(null);
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    (async () => {
      try {
        const fn = await listen<ScoreSnapshot>(SCORE_TICK_EVENT, (e) => {
          if (!cancelled) setSnap(e.payload);
        });
        if (cancelled) fn();
        else unlisten = fn;
      } catch (err) {
        console.error("[mohashim] score-tick listen failed", err);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  return snap;
}
