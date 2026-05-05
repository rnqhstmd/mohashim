import { useEffect, useState } from "react";

export const IDLE_LABELS = [
  "음료 홀짝이는 중",
  "웹 서핑 중",
  "멍때리는 중",
  "애인 생각 중",
  "딴 생각 중",
  "상상 중",
  "명상 중",
] as const;

export const ROTATE_INTERVAL_MS = 8000;

/**
 * Idle chip 라벨을 반환한다 (DEC-Q7).
 *
 * - active=true 진입 시 무작위 인덱스에서 시작 → 8초마다 (idx+1) % 7.
 * - active=false 시 인덱스 미보존, 빈 문자열 반환. 호출자가 chip 자체 렌더 분기.
 */
export function useIdleChipLabel(active: boolean): string {
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    if (!active) {
      setLabel("");
      return;
    }
    let idx = Math.floor(Math.random() * IDLE_LABELS.length);
    setLabel(IDLE_LABELS[idx]);
    const handle = setInterval(() => {
      idx = (idx + 1) % IDLE_LABELS.length;
      setLabel(IDLE_LABELS[idx]);
    }, ROTATE_INTERVAL_MS);
    return () => {
      clearInterval(handle);
    };
  }, [active]);

  return label;
}
