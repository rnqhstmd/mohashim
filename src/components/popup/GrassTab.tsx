import { useEffect, useMemo, useRef, useState } from "react";
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
  // Phase 10 AC-17: 이전 월 버튼 경계는 올해 1월(= -getMonth()). mount 1회 산출.
  // 자정 경계 부정확은 본 Phase 수용 — 재mount/재기동 시 자가 회복.
  const minOffset = useMemo(() => -new Date().getMonth(), []);

  useEffect(() => {
    let cancelled = false;
    // monthOffset 변경 시 stale data로 ShareCard가 합성되는 것을 방지하기 위해 즉시 초기화.
    setData(null);
    setLoaded(false);
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
    if (!shareRef.current || busy || !data) return;
    // 월 이동 중 stale data 방지 — data.monthOffset이 현재 monthOffset과 일치할 때만 진행.
    if (data.monthOffset !== monthOffset) return;
    setBusy(true);
    try {
      // QE-1 1초 SLA — Promise.race로 timeout. 초과 시 실패 토스트.
      const SHARE_TIMEOUT_MS = 1000;
      const composed = await Promise.race<Blob>([
        composeShareCard(shareRef.current).then(async (blob) => {
          await copyShareCardToClipboard(blob);
          return blob;
        }),
        new Promise<Blob>((_, reject) =>
          setTimeout(() => reject(new Error("share timeout > 1s")), SHARE_TIMEOUT_MS)
        ),
      ]);
      void composed;
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
          disabled={busy || !loaded || !data}
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
          minOffset={minOffset}
        />
      </div>

      <ShareCard ref={shareRef} data={data} />
    </div>
  );
}
