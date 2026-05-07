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
 * 활성 탭은 deep 배경 pill, 비활성 탭은 deep/60 텍스트.
 */
export function BottomTabBar({ tab, onChange }: BottomTabBarProps) {
  return (
    <nav className="relative z-10 flex justify-around border-t border-ink/10 bg-paperWarm/90 p-2 backdrop-blur-sm">
      {TABS.map((item) => {
        const isActive = item.id === tab;
        const className = isActive
          ? "rounded-full bg-deepNavy px-3 py-1 text-sm font-bold text-white shadow-[1px_1px_0_0_#2b2520]"
          : "px-3 py-1 text-sm font-medium text-deep/60 hover:text-deep";
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
