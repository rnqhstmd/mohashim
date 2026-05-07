/**
 * 데시벨(dB) 노이즈 미터 — Mohashim Design.html(popup.jsx line 308-345 NoiseMeter) 정렬.
 *
 * Phase 21 사용자 피드백: 평상시/집중 모드 모두에서 dB 측정 UI가 노출되어야 함.
 * MainScreen 헤더 영역(아래 ModeChip 옆)에 컴팩트하게 배치하기 위한 작은 가로 게이지.
 *
 * - 30~100 dB → 0~100% 게이지 너비.
 * - 65 dB threshold tick (조용함 / 시끄러움 경계).
 * - 80 dB 이상 (noiseLoud) → red 채움 + 환경 라벨 색.
 * - 환경 라벨 (📚도서관/🏠집/☕조용한 카페/🗣시끄러운 카페/👥군중/🚧굉음).
 */
type NoiseMeterProps = {
  db: number;
  size?: "sm" | "md";
};

function envFromDb(db: number): { icon: string; label: string } {
  if (db <= 40) return { icon: "📚", label: "도서관" };
  if (db <= 55) return { icon: "🏠", label: "집" };
  if (db <= 65) return { icon: "☕", label: "조용한 카페" };
  if (db <= 75) return { icon: "🗣", label: "시끄러운 카페" };
  if (db <= 85) return { icon: "👥", label: "군중" };
  return { icon: "🚧", label: "굉음" };
}

export function NoiseMeter({ db, size = "sm" }: NoiseMeterProps) {
  // Phase 21 사용자 피드백: 음수 dB(예: -67) 표시 문제. score 엔진은 dBFS(full
  // scale, 0~-∞) 기준이라 -67 같은 음수가 자연스럽게 나옴. UX는 dBSPL(가청 영역
  // 30~100)을 기대하므로 +94 보정으로 근사 변환 후 0~120으로 클램프.
  // 정확한 calibration은 마이크/환경에 따라 다르나, 일상 환경 추정에는 충분.
  const dbSpl = Math.max(0, Math.min(120, db + 94));
  const env = envFromDb(dbSpl);
  const pct = Math.max(0, Math.min(100, ((dbSpl - 30) / 70) * 100));
  const tickAt65 = ((65 - 30) / 70) * 100;
  const danger = dbSpl > 65;
  const h = size === "sm" ? 5 : 8;
  const dangerColor = "#d8554b";
  const successColor = "#5fa97a";
  const fillColor = danger ? dangerColor : successColor;

  return (
    <div className="w-full" data-testid="noise-meter">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-ink">
        <span aria-hidden>{env.icon}</span>
        <span>{env.label}</span>
        <span className="flex-1" />
        <span
          className="tabular-nums"
          style={{ color: danger ? dangerColor : "#8a93a6" }}
        >
          {Math.round(dbSpl)}
          <span className="ml-px text-[8px] opacity-70">dB</span>
        </span>
      </div>
      <div
        className="relative mt-1 w-full overflow-hidden rounded-full border border-ink/30 bg-ink/5"
        style={{ height: h }}
      >
        {/* 조용함(< 65 dB) 영역 tint */}
        <div
          className="absolute left-0 top-0 h-full"
          style={{ width: `${tickAt65}%`, background: "rgba(95, 169, 122, 0.18)" }}
        />
        {/* fill */}
        <div
          className="absolute left-0 top-0 h-full transition-all"
          style={{ width: `${pct}%`, background: fillColor }}
        />
        {/* 65 dB threshold tick */}
        <div
          className="absolute top-0 h-full w-px bg-ink/50"
          style={{ left: `${tickAt65}%` }}
        />
      </div>
    </div>
  );
}
