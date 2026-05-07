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
 * Mohashim Design.html(popup.jsx line 489-525)의 TabIcon — 3개 탭별 SVG.
 *
 * - todos: rounded square + ✓ 체크
 * - grass: 4×4 잔디 셀 grid
 * - settings: 톱니바퀴(cog)
 *
 * 활성 시 deepNavy stroke + 옅은 fill, 비활성 시 ink/45 stroke.
 */
function TabIcon({ kind, active }: { kind: Tab; active: boolean }) {
  const stroke = active ? "currentColor" : "currentColor";
  const opacity = active ? 1 : 0.55;
  if (kind === "todos") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        style={{ opacity }}
      >
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx="4"
          stroke={stroke}
          strokeWidth="1.8"
          fill={active ? "currentColor" : "none"}
          fillOpacity={active ? 0.1 : 0}
        />
        <path
          d="M8.5 12.5l2.5 2.5 4.5-5"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "grass") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        style={{ opacity }}
      >
        {[
          [4, 4], [10, 4], [16, 4],
          [4, 10], [10, 10], [16, 10],
          [4, 16], [10, 16], [16, 16],
        ].map(([x, y], i) => (
          <rect
            key={i}
            x={x}
            y={y}
            width="4"
            height="4"
            rx="1"
            stroke={stroke}
            strokeWidth="1.5"
            fill={active && (i === 4 || i === 5 || i === 7) ? "currentColor" : "none"}
            fillOpacity={active && (i === 4 || i === 5 || i === 7) ? 0.6 : 0}
          />
        ))}
      </svg>
    );
  }
  // settings
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ opacity }}
    >
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke={stroke}
        strokeWidth="1.8"
      />
      <path
        d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * 하단 탭 바 — 3개 탭 (todos/grass/settings).
 *
 * Mohashim Design.html 정렬: 활성 탭은 deepNavy 8% tint pill + deepNavy bold 텍스트 + 아이콘,
 * 비활성 탭은 transparent + MUTED 톤. borderTop 없이 padding으로 분리한다.
 */
export function BottomTabBar({ tab, onChange }: BottomTabBarProps) {
  return (
    <nav className="relative z-10 flex gap-1 px-3 pb-2.5 pt-1.5">
      {TABS.map((item) => {
        const isActive = item.id === tab;
        const className = isActive
          ? "flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-deepNavy/10 py-1.5 text-[10px] font-extrabold text-deepNavy"
          : "flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-transparent py-1.5 text-[10px] font-semibold text-ink/55 transition-colors hover:text-ink/75";
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={className}
          >
            <TabIcon kind={item.id} active={isActive} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
