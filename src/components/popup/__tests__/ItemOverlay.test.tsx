import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ItemOverlay } from "../ItemOverlay";
import { findItem } from "../../../lib/shopCatalog";

/**
 * ItemOverlay 컴포넌트 회귀 테스트 (Phase 25).
 *
 * Z-index 순서: back(z-0) → potato(z-10) → head(z-20) → face(z-30) (BR-1).
 * 미장착 슬롯은 <img>를 렌더하지 않는다 (FR-8).
 * previewItem은 동일 슬롯의 equipped를 시각적으로 대체한다 (FR-7).
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

  it("AC-13: back 슬롯 equipped 시 z-0 img가 back SVG 경로로 렌더된다", () => {
    const item = findItem("back_cloak_navy")!;
    const { container } = render(
      <ItemOverlay
        equipped={{ face: null, head: null, back: item.id }}
        size={80}
      />,
    );
    // .z-0은 img 외에 z-10 div도 있으므로 img 태그 한정으로 검색.
    const backImg = container.querySelector("img.z-0") as HTMLImageElement | null;
    expect(backImg).not.toBeNull();
    expect(backImg!.getAttribute("src")).toBe(item.svgPath);
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
    expect(container.querySelector("img.z-0")).toBeNull();
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

  it("AC-8 (BR-3): animated=true 시 Potato svg에 animate-mh-bob 클래스 적용", () => {
    const { container } = render(
      <ItemOverlay
        equipped={{ face: null, head: null, back: null }}
        size={80}
        animated={true}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("class") ?? "").toContain("animate-mh-bob");
  });

  it("AC-9 (BR-3): animated=false 시 Potato svg에 animate-mh-bob 클래스 미적용", () => {
    const { container } = render(
      <ItemOverlay
        equipped={{ face: null, head: null, back: null }}
        size={80}
        animated={false}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("class") ?? "").not.toContain("animate-mh-bob");
  });

  it("AC-10 (BR-1): 모든 슬롯 장착 시 DOM 순서가 back(z-0) → head(z-20) → face(z-30)이고 Potato는 z-10 div에 위치", () => {
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
    // 기대 순서: back img (z-0) → potato wrapper div (z-10) → head img (z-20) → face img (z-30).
    expect(children.length).toBe(4);
    expect(children[0].tagName).toBe("IMG");
    expect(children[0].className).toContain("z-0");
    expect(children[1].tagName).toBe("DIV");
    expect(children[1].className).toContain("z-10");
    // z-10 div 내부에 Potato svg.
    expect(children[1].querySelector("svg")).not.toBeNull();
    expect(children[2].tagName).toBe("IMG");
    expect(children[2].className).toContain("z-20");
    expect(children[3].tagName).toBe("IMG");
    expect(children[3].className).toContain("z-30");
  });
});
