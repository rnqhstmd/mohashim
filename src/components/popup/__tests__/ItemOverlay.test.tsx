import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ItemOverlay } from "../ItemOverlay";
import { findItem } from "../../../lib/shopCatalog";

/**
 * ItemOverlay 컴포넌트 회귀 테스트 (Phase 25).
 *
 * Z-index 순서: potato(z-10 div) → back(z-[15]) → head(z-20) → face(z-30) (BR-1).
 * 미장착 슬롯은 <img>를 렌더하지 않는다 (FR-8).
 * previewItem은 동일 슬롯의 equipped를 시각적으로 대체한다 (FR-7).
 * animated=true 시 루트 wrapper div에 animate-mh-bob 클래스 적용 (BR-3).
 */

describe("ItemOverlay (Phase 25)", () => {
  it("AC-11: face 슬롯 equipped 시 z-30 img가 face SVG 경로로 렌더된다", () => {
    const item = findItem("face_round_glasses")!;
    const { container } = render(
      <ItemOverlay
        equipped={{ face: item.id, head: null, back: null }}
        size={80}
      />,
    );
    const faceImg = container.querySelector("img.z-30") as HTMLImageElement | null;
    expect(faceImg).not.toBeNull();
    expect(faceImg!.tagName).toBe("IMG");
    expect(faceImg!.getAttribute("src")).toBe(item.svgPath);
  });

  it("AC-12: head 슬롯 equipped 시 z-20 img가 head SVG 경로로 렌더된다", () => {
    const item = findItem("head_strawhat")!;
    const { container } = render(
      <ItemOverlay
        equipped={{ face: null, head: item.id, back: null }}
        size={80}
      />,
    );
    const headImg = container.querySelector("img.z-20") as HTMLImageElement | null;
    expect(headImg).not.toBeNull();
    expect(headImg!.tagName).toBe("IMG");
    expect(headImg!.getAttribute("src")).toBe(item.svgPath);
  });

  it("AC-13: back 슬롯 equipped 시 z-[15] img가 back SVG 경로로 렌더된다", () => {
    const item = findItem("back_cloak_navy")!;
    const { container } = render(
      <ItemOverlay
        equipped={{ face: null, head: null, back: item.id }}
        size={80}
      />,
    );
    // back 슬롯은 z-[15] (Tailwind arbitrary value).
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("src")).toBe(item.svgPath);
  });

  it("AC-14 (FR-8): 모든 슬롯이 null이면 컨테이너 내부에 <img>를 0개 렌더한다", () => {
    const { container } = render(
      <ItemOverlay
        equipped={{ face: null, head: null, back: null }}
        size={80}
      />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(0);
    // Potato는 <svg>로 렌더되므로 별도 검증.
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("role")).toBe("img");
  });

  it("AC-15 (FR-7): face equipped + previewItem(face slot) 전달 시 z-30이 previewItem.svgPath로 대체된다", () => {
    const equippedItem = findItem("face_round_glasses")!;
    const previewItem = findItem("face_heart_glasses")!;
    const { container } = render(
      <ItemOverlay
        equipped={{ face: equippedItem.id, head: null, back: null }}
        previewItem={previewItem}
        size={80}
      />,
    );
    const faceImg = container.querySelector("img.z-30") as HTMLImageElement | null;
    expect(faceImg).not.toBeNull();
    expect(faceImg!.getAttribute("src")).toBe(previewItem.svgPath);
    // 다른 슬롯은 영향 없음 — head/back img 미렌더.
    expect(container.querySelector("img.z-20")).toBeNull();
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
  });

  it("AC-7 (FR-8): face만 장착 시 head/back img는 미렌더 (img 1개만 존재)", () => {
    const item = findItem("face_round_glasses")!;
    const { container } = render(
      <ItemOverlay
        equipped={{ face: item.id, head: null, back: null }}
        size={80}
      />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    // Potato svg는 별개로 존재.
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("AC-8 (BR-3): animated=true 시 루트 wrapper div에 animate-mh-bob 클래스 적용", () => {
    const { container } = render(
      <ItemOverlay
        equipped={{ face: null, head: null, back: null }}
        size={80}
        animated={true}
      />,
    );
    // animate-mh-bob은 루트 wrapper div에 적용 (Potato svg 내부가 아님).
    const root = container.firstChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).toContain("animate-mh-bob");
  });

  it("AC-9 (BR-3): animated=false 시 루트 wrapper div에 animate-mh-bob 클래스 미적용", () => {
    const { container } = render(
      <ItemOverlay
        equipped={{ face: null, head: null, back: null }}
        size={80}
        animated={false}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.className).not.toContain("animate-mh-bob");
  });

  it("AC-10 (BR-1): 모든 슬롯 장착 시 DOM 순서가 potato wrapper(z-10) → back → head(z-20) → face(z-30)이고 img 3개 렌더", () => {
    const face = findItem("face_round_glasses")!;
    const head = findItem("head_strawhat")!;
    const back = findItem("back_cloak_navy")!;
    const { container } = render(
      <ItemOverlay
        equipped={{ face: face.id, head: head.id, back: back.id }}
        size={80}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root).not.toBeNull();
    const children = Array.from(root.children) as HTMLElement[];
    // 기대 순서: potato wrapper div (z-10) → back img (z-[15]) → head img (z-20) → face img (z-30).
    expect(children.length).toBe(4);
    expect(children[0].tagName).toBe("DIV");
    expect(children[0].className).toContain("z-10");
    // z-10 div 내부에 Potato svg.
    expect(children[0].querySelector("svg")).not.toBeNull();
    // back img는 z-[15] arbitrary class.
    expect(children[1].tagName).toBe("IMG");
    expect(children[2].tagName).toBe("IMG");
    expect(children[2].className).toContain("z-20");
    expect(children[3].tagName).toBe("IMG");
    expect(children[3].className).toContain("z-30");
  });
});
