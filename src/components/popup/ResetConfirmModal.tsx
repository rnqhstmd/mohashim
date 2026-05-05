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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={handleCancel}
    >
      <div
        className="w-72 rounded-xl bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-ink">
          '모하'를 입력하면 모든 데이터가 삭제됩니다.
        </p>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="모하"
          className="mt-3 w-full rounded-md border border-deep/20 bg-white px-3 py-2 text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md bg-deep px-4 py-2 text-sm text-white"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded-md bg-peach px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
