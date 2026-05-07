type EmptyChipProps = {
  active?: boolean;
  onClick?: () => void;
};

/**
 * picker의 "선택 안 함" placeholder 칩 — dashed 보더 + ＋. value=null 상태 표현.
 */
export function EmptyChip({ active = false, onClick }: EmptyChipProps) {
  const style = active
    ? "border-ink bg-deepNavy/10 text-deepNavy font-bold"
    : "border-ink/30 text-ink/45 hover:text-ink/65";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-dashed px-3 py-1.5 text-sm transition-colors ${style}`}
    >
      <span>＋</span>
      <span>선택 안 함</span>
    </button>
  );
}
