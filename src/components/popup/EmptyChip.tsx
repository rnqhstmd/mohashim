type EmptyChipProps = {
  active?: boolean;
  onClick?: () => void;
};

/**
 * picker의 "선택 안 함" placeholder 칩 — dashed 보더 + ＋. value=null 상태 표현.
 */
export function EmptyChip({ active = false, onClick }: EmptyChipProps) {
  const style = active
    ? "border-deep bg-deep/10 text-deep"
    : "border-deep/30 text-deep/40";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed px-3 py-1.5 text-sm ${style}`}
    >
      <span>＋</span>
      <span>선택 안 함</span>
    </button>
  );
}
