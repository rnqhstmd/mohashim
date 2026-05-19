/**
 * 데시벨(dB) 노이즈 라벨 — Mohashim Design.html(popup.jsx) 정렬.
 *
 * Phase 21 사용자 피드백:
 *   - 평상시/집중 모드 모두에서 dB 측정 UI가 노출되어야 함.
 *   - 데시벨 바(progress)는 제거. 환경 라벨 + dB 숫자만 인라인 태그로 표시.
 *
 * 환경 라벨 (📚도서관/🏠집/☕조용한 카페/🗣시끄러운 카페/👥군중/🚧굉음).
 * 80 dBSPL 이상은 위험 색상.
 */
type NoiseMeterProps = {
  db: number;
  size?: "sm" | "md";
};

function envFromDb(db: number): { icon: string; label: string } {
  if (db <= 40) return { icon: "📚", label: "조용하네" };
  if (db <= 55) return { icon: "🏠", label: "조용하네" };
  if (db <= 65) return { icon: "☕", label: "조용한듯아닌듯" };
  if (db <= 75) return { icon: "🗣", label: "조금시끄러븜" };
  if (db <= 85) return { icon: "👥", label: "시끄러워!!" };
  return { icon: "🚧", label: "잠만에바다진짜" };
}

export function NoiseMeter({ db, size = "sm" }: NoiseMeterProps) {
  // db === 0은 마이크 권한 미부여 또는 audio thread 미기동 sentinel.
  // dBFS는 RMS_FLOOR로 인해 음수로 수렴하므로, 정확히 0은 "측정 안됨"을 의미.
  // SPL 변환: dBFS + 94 보정 (전형 마이크 sensitivity), 0~120 클램프.
  const inactive = db === 0;
  const dbSpl = inactive ? 0 : Math.max(0, Math.min(120, db + 94));
  const env = inactive
    ? { icon: "🎙", label: "측정 대기 중" }
    : envFromDb(dbSpl);
  const danger = !inactive && dbSpl > 75;
  const dangerColor = "#d8554b";
  const calmColor = "#5fa97a";
  const idleColor = "#8a93a6";
  const accentColor = inactive ? idleColor : danger ? dangerColor : calmColor;
  const textSize = size === "sm" ? "text-[11px]" : "text-xs";

  return (
    <div
      className={`flex items-center gap-1.5 ${textSize} font-bold`}
      data-testid="noise-meter"
      style={{ color: accentColor }}
    >
      <span aria-hidden>{env.icon}</span>
      <span>{env.label}</span>
      <span
        className="ml-auto rounded-full border px-2 py-0.5 tabular-nums"
        style={{ borderColor: accentColor }}
      >
        {inactive ? "—" : `${Math.round(dbSpl)} dB`}
      </span>
    </div>
  );
}
