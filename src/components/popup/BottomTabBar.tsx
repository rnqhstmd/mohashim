export type Tab = "todos" | "grass" | "shop";

type BottomTabBarProps = {
  tab: Tab;
  onChange: (next: Tab) => void;
};

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "todos", label: "할 일" },
  { id: "grass", label: "잔디" },
  { id: "shop", label: "상점" },
];

/**
 * Mohashim Design.html(popup.jsx line 489-525)의 TabIcon — 3개 탭별 SVG.
 *
 * - todos: rounded square + ✓ 체크
 * - grass: 4×4 잔디 셀 grid
 * - shop: 쇼핑백
 *
 * 활성 시 deepNavy stroke + 옅은 fill, 비활성 시 ink/45 stroke.
 *
 * Phase 26 FR-19: mailbox/settings 탭 분기 제거 — 우상단 헤더 아이콘으로 이동 (MainHeader).
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
  // shop
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ opacity }}
    >
      <path
        d="M5 8h14l-1.4 10.5a2 2 0 01-2 1.5h-7.2a2 2 0 01-2-1.5L5 8z"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.08 : 0}
      />
      <path
        d="M9 8V6a3 3 0 016 0v2"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 하단 탭 바 — 3개 탭 (todos/grass/shop) (Phase 26 FR-19, AC-11).
 *
 * Mohashim Design.html 정렬: 활성 탭은 deepNavy 8% tint pill + deepNavy bold 텍스트 + 아이콘,
 * 비활성 탭은 transparent + MUTED 톤. borderTop 없이 padding으로 분리한다.
 *
 * mailbox/settings 진입은 MainHeader 우상단 아이콘으로 이동 (FR-20).
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
            <span className="relative inline-flex">
              <TabIcon kind={item.id} active={isActive} />
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
