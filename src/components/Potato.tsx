import { VALID_POTATO_STATES, type PotatoState } from "../lib/phrases";

export type PotatoProps = {
  state: PotatoState;
  size?: number;
  animated?: boolean;
};

const POTATO_ARIA_LABELS: Record<PotatoState, string> = {
  focused: "집중하는 모하",
  calm: "차분한 모하",
  distracted: "주의가 산만한 모하",
  covering: "걱정하는 모하",
  stressed: "스트레스 받는 모하",
};

const SPROUT_FILL: Record<PotatoState, string> = {
  focused: "fill-sproutVivid",
  calm: "fill-sproutFresh",
  distracted: "fill-sproutNeutral",
  covering: "fill-sproutDry",
  stressed: "fill-sproutWilt",
};

export function Potato({ state, size = 140, animated = true }: PotatoProps) {
  // 호출자가 `as PotatoState` 캐스트 등으로 invalid 값을 흘려도 throw 없이 'calm' 폴백.
  // (Sprout 내부의 SPROUT_LEAF_TRANSFORMS[state] 가 undefined가 되어 leaves.left 접근 시 TypeError가 나는 것을 방지.
  //  mapPhaseToPotatoState와 동일한 폴백 정책을 컴포넌트 단에도 일관 적용.)
  const safeState: PotatoState = VALID_POTATO_STATES.has(state) ? state : "calm";
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={POTATO_ARIA_LABELS[safeState]}
      className={animated ? "animate-mh-bob" : undefined}
    >
      <Sprout state={safeState} />
      <ellipse
        cx="100"
        cy="115"
        rx="60"
        ry="53"
        className="fill-sun stroke-ink"
        strokeWidth="1.5"
      />
      {renderFace(safeState)}
    </svg>
  );
}

type SproutProps = { state: PotatoState };

const SPROUT_LEAF_TRANSFORMS: Record<
  PotatoState,
  { left: string; right: string }
> = {
  focused: {
    left: "rotate(-30 100 58)",
    right: "rotate(30 100 58)",
  },
  calm: {
    left: "rotate(-15 100 58)",
    right: "rotate(10 100 58)",
  },
  distracted: {
    left: "rotate(-45 100 58) translate(0 2)",
    right: "rotate(45 100 58) translate(0 2)",
  },
  covering: {
    left: "rotate(-75 100 58) translate(0 4)",
    right: "rotate(75 100 58) translate(0 4)",
  },
  stressed: {
    left: "rotate(-100 100 58) translate(0 6)",
    right: "rotate(100 100 58) translate(0 6)",
  },
};

function Sprout({ state }: SproutProps) {
  const fill = SPROUT_FILL[state];
  const leaves = SPROUT_LEAF_TRANSFORMS[state];
  return (
    <g>
      <line
        x1="100"
        y1="68"
        x2="100"
        y2="56"
        className="stroke-ink"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M 100 58 Q 92 50 96 44 Q 100 50 100 58 Z"
        className={`${fill} stroke-ink`}
        strokeWidth="1"
        transform={leaves.left}
      />
      <path
        d="M 100 58 Q 108 50 104 44 Q 100 50 100 58 Z"
        className={`${fill} stroke-ink`}
        strokeWidth="1"
        transform={leaves.right}
      />
    </g>
  );
}

function renderFace(state: PotatoState): JSX.Element | null {
  switch (state) {
    case "focused":
      return (
        <>
          <path
            d="M 80 108 Q 85 102 90 108"
            className="stroke-ink"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M 110 108 Q 115 102 120 108"
            className="stroke-ink"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M 85 121 Q 100 132 115 121"
            className="stroke-ink"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <ellipse
            cx="80"
            cy="120"
            rx="6"
            ry="4"
            className="fill-peach"
            opacity="0.9"
          />
          <ellipse
            cx="120"
            cy="120"
            rx="6"
            ry="4"
            className="fill-peach"
            opacity="0.9"
          />
        </>
      );
    case "calm":
      return (
        <>
          <circle cx="85" cy="110" r="2" className="fill-ink" />
          <circle cx="115" cy="110" r="2" className="fill-ink" />
          <path
            d="M 92 123 Q 100 128 108 123"
            className="stroke-ink"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <ellipse
            cx="80"
            cy="122"
            rx="5"
            ry="3"
            className="fill-peach"
            opacity="0.5"
          />
          <ellipse
            cx="120"
            cy="122"
            rx="5"
            ry="3"
            className="fill-peach"
            opacity="0.5"
          />
        </>
      );
    case "distracted":
      return (
        <>
          <circle cx="88" cy="110" r="2" className="fill-ink" />
          <circle cx="118" cy="110" r="2" className="fill-ink" />
          <path
            d="M 90 124 Q 100 122 110 124"
            className="stroke-ink"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      );
    case "covering":
      return (
        <>
          <circle cx="85" cy="112" r="2" className="fill-ink" />
          <circle cx="115" cy="112" r="2" className="fill-ink" />
          <path
            d="M 88 124 Q 92 122 96 124 T 104 124 T 112 124"
            className="stroke-ink"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            data-testid="potato-tear"
            d="M 80 116 Q 78 122 82 122 Q 84 120 80 116 Z"
            className="fill-sky"
          />
        </>
      );
    case "stressed":
      return (
        <>
          <line
            x1="80"
            y1="105"
            x2="90"
            y2="115"
            className="stroke-ink"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="90"
            y1="105"
            x2="80"
            y2="115"
            className="stroke-ink"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="110"
            y1="105"
            x2="120"
            y2="115"
            className="stroke-ink"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="120"
            y1="105"
            x2="110"
            y2="115"
            className="stroke-ink"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle
            cx="100"
            cy="124"
            r="4"
            fill="none"
            className="stroke-ink"
            strokeWidth="2"
          />
          <path
            data-testid="potato-sweat"
            d="M 130 60 Q 128 66 132 66 Q 134 64 130 60 Z"
            className="fill-sky"
          />
        </>
      );
    default: {
      // exhaustive check — TypeScript가 모든 케이스가 처리됐음을 보장. 런타임 폴백.
      const _exhaustive: never = state;
      void _exhaustive;
      return null;
    }
  }
}
