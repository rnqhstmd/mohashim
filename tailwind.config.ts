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
        // Phase 6: todos 탭 상단 카드(PomodoroCard/FocusStartButton) 배경. active 그라디언트와 일관.
        cream: "#fff8e0",
        // Phase 3: ModeChip 배경 색상 (FR-chip-color).
        chipIdle: "#9ca3af",
        chipFocus: "#dc4646",
        chipBreak: "#d68a6a",
        // Phase 4: character/잔디 색상 토큰.
        sproutVivid: "#4CAF50",
        sproutFresh: "#81C784",
        sproutNeutral: "#A5D6A7",
        sproutDry: "#C8E6C9",
        sproutWilt: "#BDBDBD",
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
        // Phase 3: ModeChip pulse dot 애니메이션 (FR-pulse, AC-30).
        // PRD 명시 1.2s ease-in-out scale 효과.
        mhpulse: {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.4)", opacity: "0.5" },
        },
        // Phase 4: character (모하 캐릭터) 애니메이션.
        "mh-bob": {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-3px) rotate(-1deg)" },
        },
        "mh-pulse": {
          "0%, 100%": { opacity: "0.85" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        // Phase 3: timer 도메인이 사용하는 mhpulse는 자체 keyframe(1.2s scale) 사용.
        // character가 main에 추가한 mh-pulse alias 폴백은 phase-3 머지로 더 이상 필요 없음.
        mhpulse: "mhpulse 1.2s ease-in-out infinite",
        // Phase 4: character 도메인 애니메이션.
        "mh-bob": "mh-bob 3.2s ease-in-out infinite",
        "mh-pulse": "mh-pulse 0.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
