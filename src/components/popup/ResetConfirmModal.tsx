import { useState } from "react";

type ResetConfirmModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const CONFIRM_KEYWORD = "모하";

/**
 * 전체 데이터 초기화 확인 모달 (설계 §15, BR-reset-2).
 *
 * "모하" 정확 일치 시에만 확인 버튼 활성. 확인/취소 시 입력값 초기화.
 */
export function ResetConfirmModal({
  open,
  onConfirm,
  onCancel,
}: ResetConfirmModalProps) {
  const [text, setText] = useState("");

  if (!open) return null;

  const canConfirm = text === CONFIRM_KEYWORD;

  const handleConfirm = () => {
    setText("");
    onConfirm();
  };

  const handleCancel = () => {
    setText("");
    onCancel();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-confirm-title"
      aria-describedby="reset-confirm-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45"
      onClick={handleCancel}
    >
      <div
        className="w-72 rounded-2xl border-[1.5px] border-ink bg-paperWarm p-4 shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reset-confirm-title" className="text-sm font-extrabold text-ink">
          데이터 초기화 확인
        </h2>
        <p id="reset-confirm-desc" className="mt-2 text-xs leading-snug text-ink/65">
          '모하'를 입력하면 모든 데이터가 삭제됩니다.
        </p>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="확인 키워드 입력 (모하)"
          placeholder="모하"
          className="mt-3 w-full rounded-md border border-ink/20 bg-paperWarm/80 px-3 py-2 text-sm text-ink placeholder:text-ink/40 outline-none focus:border-ink/50"
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 rounded-lg border-[1.5px] border-ink bg-paperWarm px-3 py-2 text-xs font-extrabold text-ink shadow-[1.5px_1.5px_0_0_#2b2520] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 rounded-lg border-[1.5px] border-ink bg-[#d8554b] px-3 py-2 text-xs font-extrabold text-paperWarm shadow-[1.5px_1.5px_0_0_#2b2520] transition-transform hover:-translate-y-px active:translate-y-0 active:shadow-none disabled:cursor-not-allowed disabled:bg-[#d8554b]/40 disabled:shadow-none disabled:hover:translate-y-0"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
