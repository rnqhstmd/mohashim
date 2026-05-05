import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Potato } from "../Potato";

describe("Potato — viewBox + animate-mh-bob 토글 (AC-16)", () => {
  it("animated=true 일 때 viewBox 200×200 + animate-mh-bob 클래스를 적용한다", () => {
    render(<Potato state="focused" size={140} animated={true} />);
    const svg = screen.getByRole("img", { name: "집중하는 모하" });
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 200");
    const cls = svg.getAttribute("class") ?? "";
    expect(cls).toContain("animate-mh-bob");
  });

  it("animated=false 일 때 animate-mh-bob 클래스를 적용하지 않는다", () => {
    render(<Potato state="focused" animated={false} />);
    const svg = screen.getByRole("img", { name: "집중하는 모하" });
    const cls = svg.getAttribute("class") ?? "";
    expect(cls).not.toContain("animate-mh-bob");
  });
});

describe("Potato — stressed 땀방울 (AC-17)", () => {
  it("state='stressed' 일 때 potato-sweat 요소를 렌더한다", () => {
    render(<Potato state="stressed" />);
    expect(screen.getByTestId("potato-sweat")).toBeInTheDocument();
  });
});

describe("Potato — covering 눈물 (AC-18)", () => {
  it("state='covering' 일 때 potato-tear 요소를 렌더한다", () => {
    render(<Potato state="covering" />);
    expect(screen.getByTestId("potato-tear")).toBeInTheDocument();
  });
});

describe("Potato — aria-label 5단계 한국어 라벨", () => {
  it("focused → '집중하는 모하'", () => {
    render(<Potato state="focused" />);
    expect(
      screen.getByRole("img", { name: "집중하는 모하" }),
    ).toBeInTheDocument();
  });

  it("stressed → '스트레스 받는 모하'", () => {
    render(<Potato state="stressed" />);
    expect(
      screen.getByRole("img", { name: "스트레스 받는 모하" }),
    ).toBeInTheDocument();
  });

  it("covering → '걱정하는 모하'", () => {
    render(<Potato state="covering" />);
    expect(
      screen.getByRole("img", { name: "걱정하는 모하" }),
    ).toBeInTheDocument();
  });
});

describe("Potato — sweat/tear 회귀 방지", () => {
  it("state='focused' 일 때 sweat/tear 요소가 존재하지 않는다", () => {
    render(<Potato state="focused" />);
    expect(screen.queryByTestId("potato-sweat")).toBeNull();
    expect(screen.queryByTestId("potato-tear")).toBeNull();
  });
});
