import { useEffect, useState } from "react";

// Phase 21 사용자 피드백: "애인 생각 중", "딴 생각 중" 등 개인적 멘트 제외.
export const IDLE_LABELS = [
  "상상 중",
  "명상 중",
  "노는 중",
  "딴짓 중",
  "월루 중",
  "로딩 중",
] as const;

// Phase 21 사용자 피드백: 8초 회전이 너무 잦아 산만하게 느껴진다 — 15분으로 늘려
// "거의 안 바뀐 듯하지만 가끔 환기"되는 톤으로 조정. 캐릭터의 살아있는 느낌은 유지.
export const ROTATE_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Idle chip 라벨을 반환한다 (DEC-Q7).
 *
 * - active=true 진입 시 무작위 인덱스에서 시작 → 8초마다 (idx+1) % 7.
 * - active=false 시 인덱스 미보존, 빈 문자열 반환. 호출자가 chip 자체 렌더 분기.
 *
 * lazy initial state로 첫 렌더부터 라벨을 채워 mount 직후 빈 문자열 → 라벨 깜빡임을
 * 방지한다.
 */
export function useIdleChipLabel(active: boolean): string {
  const [label, setLabel] = useState<string>(() =>
    active ? IDLE_LABELS[Math.floor(Math.random() * IDLE_LABELS.length)] : ""
  );

  useEffect(() => {
    if (!active) {
      setLabel("");
      return;
    }
    // 현재 label이 IDLE_LABELS에 포함되어 있으면 그 인덱스에서 회전 시작.
    // mount 시 lazy init으로 이미 채워진 라벨을 재사용하여 회전 시작점을 일관 유지.
    // re-entry(false → true) 시에는 label="" 상태이므로 무작위 재선택.
    let idx = IDLE_LABELS.indexOf(label as (typeof IDLE_LABELS)[number]);
    if (idx < 0) {
      idx = Math.floor(Math.random() * IDLE_LABELS.length);
      setLabel(IDLE_LABELS[idx]);
    }
    const handle = setInterval(() => {
      idx = (idx + 1) % IDLE_LABELS.length;
      setLabel(IDLE_LABELS[idx]);
    }, ROTATE_INTERVAL_MS);
    return () => {
      clearInterval(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return label;
}
