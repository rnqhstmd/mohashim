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
        "mh-bob": "mh-bob 3.2s ease-in-out infinite",
        "mh-pulse": "mh-pulse 0.6s ease-in-out infinite",
        // BR-7 호환 alias — timer 도메인이 무하이픈 'mhpulse' 키를 사용해도
        // 동일 keyframe(`mh-pulse`)으로 폴백되어 chip 펄스가 silent하게 사라지지 않는다.
        mhpulse: "mh-pulse 0.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
