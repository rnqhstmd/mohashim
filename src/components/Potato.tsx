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

// Mohashim Design.html(potato.jsx) hand-drawn palette — 갈색 외곽선 + 따뜻한 살구 톤.
const POTATO_SKIN = "#fdeed1";
const POTATO_SKIN_LIGHT = "#fff7e3";
const POTATO_SKIN_SHADE = "#f0d9a8";
const POTATO_OUTLINE = "#5a3d1f";
const POTATO_CHEEK = "#f9c4b0";
const POTATO_CHEEK_WARM = "#f0a59a";
const TEAR_FILL = "#a8d8e8";

// Hand-drawn 몸통 path — 일부러 들쑥날쑥. 디자인 시안과 동일한 좌표.
const HAND_DRAWN_BODY =
  "M 50 100 C 49 88, 53 75, 62 64 C 70 53, 84 45, 100 44 C 117 43, 132 51, 142 64 " +
  "C 151 76, 153 90, 153 105 C 154 122, 149 138, 138 152 C 127 165, 113 173, 100 173 " +
  "C 87 173, 72 167, 61 154 C 51 141, 49 124, 50 100 Z";

export function Potato({ state, size = 140, animated = true }: PotatoProps) {
  // 호출자가 `as PotatoState` 캐스트로 invalid 값을 흘려도 throw 없이 'calm' 폴백.
  const safeState: PotatoState = VALID_POTATO_STATES.has(state) ? state : "calm";
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={POTATO_ARIA_LABELS[safeState]}
      className={animated ? "animate-mh-bob" : undefined}
      style={{ display: "block", overflow: "visible" }}
    >
      <Sprout state={safeState} />
      <path
        d={HAND_DRAWN_BODY}
        fill={POTATO_SKIN}
        stroke={POTATO_OUTLINE}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M 56 130 C 56 152, 75 170, 95 172 C 78 168, 62 152, 56 130 Z"
        fill={POTATO_SKIN_SHADE}
        opacity="0.25"
      />
      <ellipse
        cx="74"
        cy="68"
        rx="11"
        ry="14"
        fill={POTATO_SKIN_LIGHT}
        opacity="0.55"
        transform="rotate(-18 74 68)"
      />
      {renderFace(safeState)}
    </svg>
  );
}

type SproutProps = { state: PotatoState };

function Sprout({ state }: SproutProps) {
  const fillClass = SPROUT_FILL[state];
  const stem = (d: string) => (
    <path
      d={d}
      stroke={POTATO_OUTLINE}
      strokeWidth={2}
      fill="none"
      strokeLinecap="round"
    />
  );
  const leaf = (d: string) => (
    <path
      d={d}
      className={fillClass}
      stroke={POTATO_OUTLINE}
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );

  switch (state) {
    case "focused":
      return (
        <g>
          {stem("M100 38 Q99.5 33 100 27")}
          {leaf("M99 28 Q92 25 87 17 Q90 16 95 19 Q99 23 101 27 Z")}
          {leaf("M101 28 Q108 24 113 16 Q110 17 106 19 Q102 23 99 27 Z")}
        </g>
      );
    case "calm":
      return (
        <g>
          {stem("M100 38 Q100.5 33 102 28")}
          {leaf("M99 31 Q94 28 91 23 Q94 24 96 26 Q98 28 100 30 Z")}
          {leaf("M101 30 Q108 25 112 17 Q108 18 104 21 Q100 25 99 29 Z")}
        </g>
      );
    case "distracted":
      return (
        <g>
          {stem("M100 38 Q102 33 105 29")}
          {leaf("M104 30 Q110 27 114 21 Q111 22 107 24 Q103 27 102 29 Z")}
          {leaf("M96 30 Q92 28 88 23 Q90 24 92 25 Q95 27 96 29 Z")}
        </g>
      );
    case "covering":
      return (
        <g>
          {stem("M100 38 Q103 35 107 33")}
          {leaf("M106 33 Q113 33 117 30 Q113 30 109 31 Q105 32 104 33 Z")}
          {leaf("M94 33 Q88 33 84 31 Q88 31 92 32 Q96 32 96 33 Z")}
        </g>
      );
    case "stressed":
      return (
        <g>
          {stem("M100 38 Q102 38 106 38")}
          {leaf("M105 38 Q111 40 114 44 Q110 41 106 40 Q103 39 104 38 Z")}
          {leaf("M95 38 Q89 40 86 44 Q90 41 94 40 Q97 39 96 38 Z")}
        </g>
      );
    default: {
      const _exhaustive: never = state;
      void _exhaustive;
      return null;
    }
  }
}

function renderFace(state: PotatoState): JSX.Element | null {
  switch (state) {
    case "focused":
      return (
        <>
          <path
            d="M82 110 Q86 105 92 110"
            stroke={POTATO_OUTLINE}
            strokeWidth={2.8}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M108 110 Q113 105 118 110"
            stroke={POTATO_OUTLINE}
            strokeWidth={2.8}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M93 124 Q97 129 100 129 Q103 129 107 124"
            stroke={POTATO_OUTLINE}
            strokeWidth={2.8}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <ellipse cx="76" cy="124" rx="5" ry="3" fill={POTATO_CHEEK} opacity="0.55" />
          <ellipse cx="124" cy="124" rx="5" ry="3" fill={POTATO_CHEEK} opacity="0.55" />
        </>
      );
    case "calm":
      return (
        <>
          <ellipse cx="86" cy="112" rx="3" ry="3.3" fill={POTATO_OUTLINE} />
          <ellipse cx="114" cy="112" rx="3" ry="3.3" fill={POTATO_OUTLINE} />
          <path
            d="M95 124 Q100 128 105 124"
            stroke={POTATO_OUTLINE}
            strokeWidth={2.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case "distracted":
      return (
        <>
          <ellipse cx="88" cy="112" rx="3" ry="3.3" fill={POTATO_OUTLINE} />
          <ellipse cx="116" cy="112" rx="3" ry="3.3" fill={POTATO_OUTLINE} />
          <path
            d="M93 124 Q97 122 100 124 Q103 126 108 123"
            stroke={POTATO_OUTLINE}
            strokeWidth={2.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case "covering":
      return (
        <>
          <ellipse cx="86" cy="114" rx="3" ry="3.3" fill={POTATO_OUTLINE} />
          <ellipse cx="114" cy="114" rx="3" ry="3.3" fill={POTATO_OUTLINE} />
          <path
            d="M95 128 Q100 124 105 128"
            stroke={POTATO_OUTLINE}
            strokeWidth={2.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            data-testid="potato-tear"
            d="M81 119 Q79 122 81 125 Q83 122 81 119 Z"
            fill={TEAR_FILL}
            stroke={POTATO_OUTLINE}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <ellipse cx="76" cy="125" rx="5" ry="3" fill={POTATO_CHEEK_WARM} opacity="0.55" />
          <ellipse cx="124" cy="125" rx="5" ry="3" fill={POTATO_CHEEK_WARM} opacity="0.55" />
        </>
      );
    case "stressed":
      return (
        <>
          <path
            d="M82 108 L92 117"
            stroke={POTATO_OUTLINE}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <path
            d="M92 108 L82 117"
            stroke={POTATO_OUTLINE}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <path
            d="M108 108 L118 117"
            stroke={POTATO_OUTLINE}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <path
            d="M118 108 L108 117"
            stroke={POTATO_OUTLINE}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <ellipse cx="100" cy="127" rx="3.6" ry="3" fill={POTATO_OUTLINE} />
          <path
            data-testid="potato-sweat"
            d="M62 60 Q60 64 62 67 Q64 64 62 60 Z"
            fill={TEAR_FILL}
            stroke={POTATO_OUTLINE}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
          <ellipse cx="76" cy="125" rx="5" ry="3" fill={POTATO_CHEEK_WARM} opacity="0.6" />
          <ellipse cx="124" cy="125" rx="5" ry="3" fill={POTATO_CHEEK_WARM} opacity="0.6" />
        </>
      );
    default: {
      const _exhaustive: never = state;
      void _exhaustive;
      return null;
    }
  }
}
