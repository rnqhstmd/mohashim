import { useEffect, useRef, useState } from "react";
import { ContributionGraph } from "./ContributionGraph";
import { ShareCard } from "./ShareCard";
import {
  composeShareCard,
  copyShareCardToClipboard,
  formatDate,
  getMonthSessions,
  type MonthData,
} from "../../lib/grass";

type GrassTabProps = {
  onShareToast: (kind: "share_ok" | "share_fail", text: string) => void;
};

/**
 * Grass 탭 본체 (FR-17, FR-18).
 *
 * - 헤더: 오늘 sessions/avg 통계 + "잔디 자랑하기" 버튼.
 * - 본문: ContributionGraph (월별 달력).
 * - off-screen ShareCard (composeShareCard 입력).
 * - 자랑하기 흐름: composeShareCard → copyShareCardToClipboard → 토스트.
 */
export function GrassTab({ onShareToast }: GrassTabProps) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [data, setData] = useState<MonthData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const shareRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const md = await getMonthSessions(monthOffset);
        if (!cancelled) setData(md);
      } catch (err) {
        console.error("[mohashim] grass load failed", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [monthOffset]);

  const handleShare = async () => {
    if (!shareRef.current || busy) return;
    setBusy(true);
    try {
      const blob = await composeShareCard(shareRef.current);
      await copyShareCardToClipboard(blob);
      onShareToast("share_ok", "복사됨");
    } catch (err) {
      console.error("[mohashim] share failed", err);
      onShareToast("share_fail", "복사 실패");
    } finally {
      setBusy(false);
    }
  };

  // 오늘 통계 — monthOffset=0이고 오늘 일자가 cells에 있으면.
  // 자기점검 수정: new Date(c.date)는 UTC 자정 파싱이라 TZ 의존. formatDate로 로컬 문자열 직접 비교.
  const todayStr = formatDate(new Date());
  const todayCell =
    monthOffset === 0 ? data?.cells.find((c) => c.date === todayStr) : undefined;
  const todaySessions = todayCell?.sessions ?? 0;
  const todayAvg = todayCell?.avg ?? 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-deep/10 px-4 py-3">
        <div className="text-sm text-deep">
          {loaded
            ? todaySessions > 0
              ? `오늘 ${todaySessions}회 · 평균 ${todayAvg}점`
              : "오늘 아직 세션 없음"
            : "..."}
        </div>
        <button
          type="button"
          onClick={() => {
            void handleShare();
          }}
          disabled={busy || !loaded}
          className="rounded-md bg-deep px-3 py-1.5 text-xs text-white disabled:opacity-40"
        >
          잔디 자랑하기
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <ContributionGraph
          data={data}
          monthOffset={monthOffset}
          onMonthChange={setMonthOffset}
        />
      </div>

      <ShareCard ref={shareRef} data={data} />
    </div>
  );
}
