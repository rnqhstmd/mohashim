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
    <nav className="flex justify-around border-t border-deep/10 bg-white p-2">
      {TABS.map((item) => {
        const isActive = item.id === tab;
        const className = isActive
          ? "rounded-full bg-deep px-3 py-1 text-sm text-white"
          : "px-3 py-1 text-sm text-deep/60";
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
