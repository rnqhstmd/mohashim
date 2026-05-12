import { useEffect, useState } from "react";
import { ItemOverlay } from "./ItemOverlay";
import type { PotatoState } from "../../lib/phrases";
import { getFocusMinutes, type Inventory } from "../../lib/storage";

type FocusStartButtonProps = {
  potatoState: PotatoState;
  phrase: string;
  db: number;
  equipped: Inventory["equipped"];
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
 * Todos 탭 상단 — idle phase에서 노출.
 *
 * 레이아웃:
 *   좌측 컬럼: 캐릭터 이미지 + 하단에 "모하 🌱 N".
 *   우측 컬럼: dB 환경 상태 + 모하 대사(phrase).
 *   전체 너비: [▶ 집중 시작 | N분] 버튼.
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
    <div className="border-b border-ink/10 bg-paperWarm/70 px-3 pb-3 pt-2 backdrop-blur-[1px]">
      {/* 2컬럼 — items-stretch(기본)로 두 컬럼 동일 높이.
          좌측 justify-between으로 모하·새싹 이름이 우측 집중 시작 버튼과 horizontally aligned. */}
      <div className="flex gap-3">
        {/* 좌측: 캐릭터(top) / 이름·새싹(bottom) */}
        <div className="flex shrink-0 flex-col items-center justify-between">
          <ItemOverlay
            equipped={equipped}
            state={potatoState}
            size={80}
            animated={true}
          />
          <div className="flex items-center gap-1">
            <span className="text-[14px] font-extrabold text-ink">모하</span>
            <span className="flex items-center gap-0.5 text-[12px] font-bold text-ink/70">
              <span aria-hidden>🌱</span>
              <span className="tabular-nums">{sprouts.toLocaleString()}</span>
            </span>
          </div>
        </div>

        {/* 우측: dB(top) / 대사(중앙·2줄) / 집중 시작 버튼(bottom) */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* dB — 가로 중앙 정렬 */}
          <div className="flex justify-center">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold"
              style={{ color: dbColor }}
            >
              <span aria-hidden>{env.icon}</span>
              <span>{env.label}</span>
              {!inactive && (
                <span className="ml-0.5 tabular-nums opacity-90">
                  {Math.round(dbSpl)}dB
                </span>
              )}
            </span>
          </div>
          {/* 대사: 좌우/수직 중앙 정렬, 2줄 고정 영역. whitespace-pre-line으로 phrases.ts의 \n 줄바꿈 보존. */}
          <div className="flex min-h-[2.8rem] flex-1 items-center justify-center">
            <p className="whitespace-pre-line text-center text-[14px] italic leading-[1.35] text-ink/75 line-clamp-2">
              "{phrase}"
            </p>
          </div>
          {/* 집중 시작 버튼 — 대사 바로 하단 */}
          <button
            type="button"
            onClick={() => { void onStart(); }}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-ink px-3 py-1.5 text-xs font-extrabold tracking-tight text-paperWarm shadow-[1.5px_1.5px_0_0_rgba(40,30,20,0.18)] transition-transform hover:-translate-y-px hover:shadow-[2px_3px_0_0_rgba(40,30,20,0.22)] active:translate-y-0 active:shadow-[1px_1px_0_0_rgba(40,30,20,0.18)]"
          >
            <span aria-hidden>▶</span>
            <span>집중 시작</span>
            <span aria-hidden className="border-l border-paperWarm/30 pl-1.5 text-[10px] font-bold text-paperWarm/70">
              {focusMins}분
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
