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
    },
  },
  plugins: [],
};

export default config;
