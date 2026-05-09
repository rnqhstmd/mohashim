import { useEffect, useState } from "react";
import { ItemOverlay } from "./ItemOverlay";
import type { PotatoState } from "../../lib/phrases";
import { getFocusMinutes, type Inventory } from "../../lib/storage";
import { useIdleChipLabel } from "../../lib/idleChip";

type FocusStartButtonProps = {
  potatoState: PotatoState;
  phrase: string;
  /** Phase 21: 데시벨 인라인 노출 — 캐릭터 헤더 내부에서 dB 라벨/숫자 표기. */
  db: number;
  /** Phase 25 FR-1: 캐릭터 레이어 장착 상태. */
  equipped: Inventory["equipped"];
  /** Phase 26 FR-22 / AC-14: 새싹 잔액. dB 상태 행 끝에 ` · 🌱 N` 형태로 통합. */
  sprouts: number;
  onStart: () => Promise<void>;
};

function envFromDb(db: number): { icon: string; label: string; danger: boolean } {
  if (db <= 40) return { icon: "📚", label: "조용해요", danger: false };
  if (db <= 55) return { icon: "🏠", label: "조용해요", danger: false };
  if (db <= 65) return { icon: "☕", label: "조용한 편", danger: false };
  if (db <= 75) return { icon: "🗣", label: "조금 시끄러워", danger: false };
  if (db <= 85) return { icon: "👥", label: "시끄러워요", danger: true };
  return { icon: "🚧", label: "매우 시끄러워", danger: true };
}

/**
 * Todos 탭 상단 — idle phase에서 노출 (Phase 21 사용자 피드백 재구조).
 *
 * 레이아웃:
 *   - 우상단 절대 위치 "평상시" 칩.
 *   - 좌측 큰 Potato (size 88) + 우측 헤더("안녕 난 모하야!") + 환경 라벨 + 멘트.
 *   - 직전 세션 점수 표시는 제거 (사용자 피드백) — 잔디 탭 상세 조회로 일원화.
 *   - 하단 풀폭 [▶ 집중 시작 | N분] 버튼.
 */
export function FocusStartButton({
  potatoState,
  phrase,
  db,
  equipped,
  sprouts,
  onStart,
}: FocusStartButtonProps) {
  const [focusMins, setFocusMins] = useState<number>(25);
  // Phase 21 사용자 피드백 (재개정): "평상시" 고정 텍스트 → 회전 무작위 멘트로
  // 교체. 본 컴포넌트는 idle phase 마운트 동안 항상 active=true.
  const idleLabel = useIdleChipLabel(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mins = await getFocusMinutes();
        if (cancelled) return;
        setFocusMins(mins);
      } catch (err) {
        console.error("[mohashim] FocusStartButton load failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const inactive = db === 0;
  const dbSpl = inactive ? 0 : Math.max(0, Math.min(120, db + 94));
  const env = inactive
    ? { icon: "🎙", label: "측정 대기 중", danger: false }
    : envFromDb(dbSpl);
  const dbColor = inactive ? "#8a93a6" : env.danger ? "#d8554b" : "#5fa97a";

  return (
    <div className="relative border-b border-ink/10 bg-paperWarm/70 px-3 pb-3 pt-2.5 backdrop-blur-[1px]">
      {/* 우상단 절대 위치 — 8초 회전 무작위 idle 멘트 (Phase 21 사용자 피드백). */}
      <span className="absolute right-3 top-2 inline-flex items-center gap-1 rounded-full border border-ink/80 bg-deepNavy px-2 py-0.5 text-[10px] font-bold text-white shadow-[1px_1px_0_0_#2b2520]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
        {idleLabel || "쉬는 중"}
      </span>

      {/* 1행: 큰 Potato + 우측 헤더 영역 */}
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <ItemOverlay
            equipped={equipped}
            state={potatoState}
            size={88}
            animated={true}
          />
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="flex items-center gap-1 text-[15px] font-extrabold leading-tight text-ink">
            <span>안녕 난 모하야!</span>
          </h2>

          {/* 상태 행: 환경 라벨 dB + 새싹 잔액(Phase 26 FR-22 / AC-14).
              형태: `{env 아이콘} {label} {N}dB · 🌱 {잔액}`. */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold">
            <span
              className="inline-flex items-center gap-1 tabular-nums"
              style={{ color: dbColor }}
            >
              <span aria-hidden>{env.icon}</span>
              <span>{env.label}</span>
              <span className="ml-0.5 opacity-90">
                {inactive ? "—" : `${Math.round(dbSpl)}dB`}
              </span>
              <span className="ml-1 opacity-70" aria-hidden>·</span>
              <span className="inline-flex items-center gap-0.5 text-ink/80">
                <span aria-hidden>🌱</span>
                <span className="tabular-nums">{sprouts.toLocaleString()}</span>
              </span>
            </span>
          </div>

          {/* 멘트 — 따옴표로 감싼 인용 스타일. 말풍선 도형 제거(헤더와 통합). */}
          <p className="mt-1 break-words text-xs italic text-ink/75">
            "{phrase}"
          </p>
        </div>
      </div>

      {/* 2행: 집중 시작 버튼 (full-width). */}
      <button
        type="button"
        onClick={() => {
          void onStart();
        }}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink bg-ink py-2.5 text-sm font-extrabold tracking-tight text-paperWarm shadow-[1.5px_1.5px_0_0_rgba(40,30,20,0.18)] transition-transform hover:-translate-y-px hover:shadow-[2px_3px_0_0_rgba(40,30,20,0.22)] active:translate-y-0 active:shadow-[1px_1px_0_0_rgba(40,30,20,0.18)]"
      >
        <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-paperWarm/15">
          ▶
        </span>
        <span>집중 시작</span>
        <span aria-hidden className="border-l border-paperWarm/30 pl-2 text-xs font-bold text-paperWarm/70">
          {focusMins}분
        </span>
      </button>
    </div>
  );
}
