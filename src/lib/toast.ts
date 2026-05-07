import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

// Phase 17 FR-tc: 잔디 공유 흐름이 SharePreviewModal로 이전되어 share_ok/share_fail이
// dead code가 됨 (PR #17 머지 후 호출 경로 0건). ToastKind에서 두 항목 제거.
export type ToastKind = "complete" | "sleep_discard" | "info";
export type ToastMessage = { id: string; kind: ToastKind; text: string };

export const TOAST_EVENT = "toast";
export const TOAST_DURATION_MS = 3000;

type ToastInput = { kind: ToastKind; text: string };

const TOAST_KINDS: readonly ToastKind[] = ["complete", "sleep_discard", "info"];

/**
 * IPC payload 런타임 검증 — Rust → JS toast 이벤트의 payload 형태가
 * { kind: ToastKind; text: string } 인지 확인한다 (RISK/MEDIUM 대응).
 * 잘못된 payload는 console.error로 기록만 하고 큐에 추가하지 않는다.
 */
function isValidToastInput(payload: unknown): payload is ToastInput {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as { kind?: unknown; text?: unknown };
  if (typeof p.text !== "string") return false;
  if (typeof p.kind !== "string") return false;
  return (TOAST_KINDS as readonly string[]).includes(p.kind);
}

function makeToastId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 토스트 큐 훅. Rust → JS `toast` 이벤트를 구독하고 3초 후 자동 dismiss한다.
 *
 * - listen: score.ts의 비동기 등록 + cancelled 플래그 패턴 일관.
 * - timer 관리: id별 setTimeout을 Map으로 보관, dismiss/unmount 시 모두 clear.
 * - 토스트는 webview 활성 시에만 가시 (설계 §11 가정).
 */
export function useToastQueue(): {
  toasts: ToastMessage[];
  push: (m: ToastInput) => void;
  dismiss: (id: string) => void;
} {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const dismiss = useCallback((id: string) => {
    const timers = timersRef.current;
    const handle = timers.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timers.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = makeToastId();
      const message: ToastMessage = { id, kind: input.kind, text: input.text };
      setToasts((prev) => [...prev, message]);
      const handle = setTimeout(() => {
        dismiss(id);
      }, TOAST_DURATION_MS);
      timersRef.current.set(id, handle);
    },
    [dismiss]
  );

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    (async () => {
      try {
        const fn = await listen<unknown>(TOAST_EVENT, (e) => {
          if (cancelled) return;
          if (!isValidToastInput(e.payload)) {
            console.error("[mohashim] invalid toast payload", e.payload);
            return;
          }
          push(e.payload);
        });
        if (cancelled) fn();
        else unlisten = fn;
      } catch (err) {
        console.error("[mohashim] toast listen failed", err);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
      const timers = timersRef.current;
      timers.forEach((handle) => clearTimeout(handle));
      timers.clear();
    };
  }, [push]);

  return { toasts, push, dismiss };
}
