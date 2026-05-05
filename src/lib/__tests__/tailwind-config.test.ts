import { describe, expect, it } from "vitest";
import config from "../../../tailwind.config";

describe("tailwind config — sprout 5색 (AC-20)", () => {
  const colors = config.theme?.extend?.colors as Record<string, string>;

  it("sproutVivid는 #4CAF50", () => {
    expect(colors.sproutVivid).toBe("#4CAF50");
  });

  it("sproutFresh는 #81C784", () => {
    expect(colors.sproutFresh).toBe("#81C784");
  });

  it("sproutNeutral은 #A5D6A7", () => {
    expect(colors.sproutNeutral).toBe("#A5D6A7");
  });

  it("sproutDry는 #C8E6C9", () => {
    expect(colors.sproutDry).toBe("#C8E6C9");
  });

  it("sproutWilt는 #BDBDBD", () => {
    expect(colors.sproutWilt).toBe("#BDBDBD");
  });
});

describe("tailwind config — 기존 6종 색 유지 (회귀 방지)", () => {
  const colors = config.theme?.extend?.colors as Record<string, string>;

  it("sky는 #7aa3e6", () => {
    expect(colors.sky).toBe("#7aa3e6");
  });

  it("mist는 #d8e4f7", () => {
    expect(colors.mist).toBe("#d8e4f7");
  });

  it("deep은 #445478", () => {
    expect(colors.deep).toBe("#445478");
  });

  it("sun은 #f4d160", () => {
    expect(colors.sun).toBe("#f4d160");
  });

  it("peach는 #e89a82", () => {
    expect(colors.peach).toBe("#e89a82");
  });

  it("ink는 #2b2520", () => {
    expect(colors.ink).toBe("#2b2520");
  });
});

describe("tailwind config — keyframes 정의 (AC-20)", () => {
  const keyframes = config.theme?.extend?.keyframes as Record<
    string,
    Record<string, Record<string, string>>
  >;

  it("mh-bob keyframes가 정의되어 있다", () => {
    expect(keyframes["mh-bob"]).toBeDefined();
  });

  it("mh-bob 0%, 100% transform이 translateY(0) rotate(0deg)", () => {
    expect(keyframes["mh-bob"]["0%, 100%"].transform).toBe(
      "translateY(0) rotate(0deg)"
    );
  });

  it("mh-bob 50% transform이 translateY(-3px) rotate(-1deg)", () => {
    expect(keyframes["mh-bob"]["50%"].transform).toBe(
      "translateY(-3px) rotate(-1deg)"
    );
  });

  it("mh-pulse keyframes가 정의되어 있다", () => {
    expect(keyframes["mh-pulse"]).toBeDefined();
  });

  it("mh-pulse 0%, 100% opacity가 0.85", () => {
    expect(keyframes["mh-pulse"]["0%, 100%"].opacity).toBe("0.85");
  });

  it("mh-pulse 50% opacity가 1", () => {
    expect(keyframes["mh-pulse"]["50%"].opacity).toBe("1");
  });
});

describe("tailwind config — animation 정의 (AC-20)", () => {
  const animation = config.theme?.extend?.animation as Record<string, string>;

  it("mh-bob animation은 'mh-bob 3.2s ease-in-out infinite'", () => {
    expect(animation["mh-bob"]).toBe("mh-bob 3.2s ease-in-out infinite");
  });

  it("mh-pulse animation은 'mh-pulse 0.6s ease-in-out infinite'", () => {
    expect(animation["mh-pulse"]).toBe("mh-pulse 0.6s ease-in-out infinite");
  });
});
