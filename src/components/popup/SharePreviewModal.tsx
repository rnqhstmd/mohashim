import { useEffect, useRef, useState } from "react";
import {
  type MonthData,
  composeShareCard,
  copyShareCardToClipboard,
} from "../../lib/grass";
import { ShareCard, SHARE_PREVIEW_DISPLAY_PX } from "./ShareCard";

type SharePreviewModalProps = {
  data: MonthData | null;
  onClose: () => void;
};

// PR #17 gemini G1: composeShareCard/clipboard 작업 1초 SLA. 무한 대기 방어.
const SHARE_TIMEOUT_MS = 1000;

/**
 * Phase 16 신규 — 잔디 자랑하기 미리보기 모달 (FR-3~8, FR-8a).
 *
 * 구조 (MA-1: off-screen ShareCard도 panel 자식으로 마운트):
 *   overlay (onClick → onClose)
 *     panel (onClick stopPropagation, animate-slide-up)
 *       X 버튼 / 제목 / 미리보기 ShareCard(previewSize=260)
 *       메시지 입력창 (autofocus, maxLength=12)
 *       "이미지 복사하기" 버튼 (busy disabled)
 *       복사/실패 안내문 (5초 자동 숨김, mutually exclusive)
 *       off-screen ShareCard(ref={copyRef}) — PNG 변환 원본 (AC-16)
 *
 * 닫기 경로: X 버튼 / 오버레이 onClick / ESC 키 (FR-8a).
 * 5초 타이머는 useEffect cleanup으로 일원화 (CON-1).
 */
export function SharePreviewModal({ data, onClose }: SharePreviewModalProps) {
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  // PR #17 gemini G2 + D2 개정: 실패/timeout 시 모달 내 안내문 표시.
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const copyRef = useRef<SVGSVGElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  // PR #18 리뷰(qa+security): GrassTab의 인라인 onClose는 매 렌더마다 새 참조 → ESC effect가
  // 재실행되어 listener가 remove/add 사이클을 반복한다. ref로 최신 onClose를 캡처하여 deps=[]로 고정.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Q3, CON-6: 메시지 입력이 모달의 핵심 액션 → autofocus.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // FR-8a: ESC 키 닫기. deps=[]로 고정하여 listener 재등록 사이클 회피.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // CON-1, R-3: 5초 타이머 cleanup은 unmount 시 단일 처리.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    []
  );

  const restartNoticeTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      setFailed(false);
      timerRef.current = null;
    }, 5000);
  };

  const onCopy = async () => {
    if (!copyRef.current || busy || !data) return;
    setBusy(true);
    // 새 시도 — 직전 안내문 즉시 정리.
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCopied(false);
    setFailed(false);
    try {
      // PR #17 gemini G1: 1초 SLA — composeShareCard + 클립보드 합산.
      const blob = await Promise.race<Blob>([
        composeShareCard(copyRef.current),
        new Promise<Blob>((_, reject) =>
          window.setTimeout(
            () => reject(new Error("share timeout")),
            SHARE_TIMEOUT_MS
          )
        ),
      ]);
      await copyShareCardToClipboard(blob);
      setCopied(true);
      restartNoticeTimer();
    } catch (err) {
      console.error("[mohashim] share failed", err);
      setFailed(true);
      restartNoticeTimer();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-[300px] rounded-md bg-cream p-4 shadow-lg animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-preview-title"
      >
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="absolute right-2 top-2 text-deep/60 hover:text-deep"
        >
          ×
        </button>
        <h3
          id="share-preview-title"
          className="mb-3 text-sm font-semibold text-ink"
        >
          잔디 자랑하기
        </h3>
        <div className="mx-auto mb-3">
          <ShareCard
            data={data}
            message={message}
            previewSize={SHARE_PREVIEW_DISPLAY_PX}
          />
        </div>
        <input
          ref={inputRef}
          type="text"
          maxLength={12}
          value={message}
          // PR #17 gemini G3: maxLength=12에 맡김. 수동 slice는 surrogate pair 손상 위험.
          onChange={(e) => setMessage(e.target.value)}
          placeholder="자랑 한 마디 남겨줘!!"
          className="mb-2 w-full rounded-md border border-deep/20 bg-white px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={onCopy}
          disabled={busy}
          className="w-full rounded-md bg-deep px-3 py-2 text-xs text-white disabled:opacity-40"
        >
          이미지 복사하기
        </button>
        {copied && (
          <p className="mt-2 text-xs text-deep">
            복사됐어요! 카카오톡·SNS에 붙여넣기 해주세요 🌱
          </p>
        )}
        {failed && (
          <p className="mt-2 text-xs text-red-600">
            복사에 실패했어요. 잠시 후 다시 시도해 주세요 😢
          </p>
        )}
        {/* MA-1: off-screen 인스턴스를 panel 내부에 배치 */}
        <ShareCard ref={copyRef} data={data} message={message} />
      </div>
    </div>
  );
}
