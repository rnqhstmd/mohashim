export type Tab = "todos" | "grass" | "settings";

type BottomTabBarProps = {
  tab: Tab;
  onChange: (next: Tab) => void;
};

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "todos", label: "할 일" },
  { id: "grass", label: "잔디" },
  { id: "settings", label: "설정" },
];

/**
 * 하단 탭 바 — 3개 탭 (todos/grass/settings).
 *
 * Mohashim Design.html 정렬: 활성 탭은 deepNavy 8% tint pill + deepNavy bold 텍스트,
 * 비활성 탭은 transparent + MUTED 톤. borderTop 없이 padding으로 분리한다.
 */
export function BottomTabBar({ tab, onChange }: BottomTabBarProps) {
  return (
    <nav className="relative z-10 flex gap-1 px-3 pb-2.5 pt-1.5">
      {TABS.map((item) => {
        const isActive = item.id === tab;
        const className = isActive
          ? "flex-1 rounded-[10px] bg-deepNavy/10 py-1.5 text-[10px] font-extrabold text-deepNavy"
          : "flex-1 rounded-[10px] bg-transparent py-1.5 text-[10px] font-semibold text-deep/55 transition-colors hover:text-deep/80";
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={className}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
