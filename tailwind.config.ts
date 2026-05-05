import type { Config } from "tailwindcss";

// 라이트 모드 only (DEC-13). darkMode는 class 전략으로 두되 실제 다크 토큰 미정의.
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        sky: "#7aa3e6",
        mist: "#d8e4f7",
        deep: "#445478",
        sun: "#f4d160",
        peach: "#e89a82",
        ink: "#2b2520",
        // Phase 3: ModeChip 배경 색상 (FR-chip-color).
        chipIdle: "#9ca3af",
        chipFocus: "#dc4646",
        chipBreak: "#d68a6a",
      },
      fontFamily: {
        pretendard: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "Apple SD Gothic Neo",
          "sans-serif",
        ],
      },
      keyframes: {
        // Phase 3: ModeChip pulse dot 애니메이션 (FR-pulse).
        mhpulse: {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.4)", opacity: "0.5" },
        },
      },
      animation: {
        mhpulse: "mhpulse 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
