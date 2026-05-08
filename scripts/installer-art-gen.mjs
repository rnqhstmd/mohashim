#!/usr/bin/env node
// Windows NSIS 인스톨러 아트 생성기.
//
// Tauri NSIS bundler는 헤더(150x57)와 사이드바(164x314) BMP를 요구한다.
// PNG는 미지원이라 sharp(SVG → raw RGBA) → bmp-js로 24-bit BMP 인코딩한다.
//
// 출력:
//   src-tauri/installer/header.bmp    — 인스톨 진행 페이지 우상단
//   src-tauri/installer/sidebar.bmp   — Welcome / Finish 페이지 좌측

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import sharp from "sharp";

// NSIS 3.x는 BITMAPINFOHEADER(40-byte) + BI_RGB + 24bpp BMP만 안정적으로 받는다.
// bmp-js 0.1.0이 출력하는 BMP는 NSIS warning 5040("Unsupported format")으로 거부되어
// (헤더 변형 또는 알파 잔재 추정), 직접 표준 24-bit BMP를 인코딩한다.
function encodeBmp24(rgbaBuffer, w, h) {
  // 각 행은 4바이트 정렬. 24bpp → row stride = ((24 * w + 31) >>> 5) << 2.
  const rowSize = ((24 * w + 31) >>> 5) << 2;
  const imageSize = rowSize * h;
  const fileSize = 14 + 40 + imageSize;
  const buf = Buffer.alloc(fileSize);

  // BITMAPFILEHEADER (14 bytes).
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10);

  // BITMAPINFOHEADER (40 bytes).
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22); // 양수 = bottom-up.
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); // BI_RGB.
  buf.writeUInt32LE(imageSize, 34);
  buf.writeUInt32LE(2835, 38); // ~72 DPI.
  buf.writeUInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  // Pixel data: bottom-up, BGR + row padding(0).
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4;
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < w; x++) {
      const sp = srcRow + x * 4;
      const dp = dstRow + x * 3;
      buf[dp] = rgbaBuffer[sp + 2]; // B
      buf[dp + 1] = rgbaBuffer[sp + 1]; // G
      buf[dp + 2] = rgbaBuffer[sp]; // R
    }
  }
  return buf;
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "src-tauri/installer");

// app-icon-gen과 동일 팔레트 (모하심 디자인 표준).
const BG = "#fef3d8";
const SKIN = "#fdeed1";
const SKIN_LIGHT = "#fff7e3";
const OUTLINE = "#5a3d1f";
const CHEEK = "#f9c4b0";
const SPROUT = "#7dc89a";

// 모하 SVG 그룹(translate/scale 외부에서 적용). 캔버스 200x200 기준 바디.
const POTATO_GROUP = `
  <g>
    <!-- 새싹 stem -->
    <path d="M100 38 Q99.5 28 100 22" stroke="${OUTLINE}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <!-- 새싹 잎 -->
    <path d="M99 24 Q90 18 84 8 Q88 9 93 12 Q98 18 101 23 Z" fill="${SPROUT}" stroke="${OUTLINE}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M101 24 Q110 18 116 8 Q112 9 107 12 Q102 18 99 23 Z" fill="${SPROUT}" stroke="${OUTLINE}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <!-- 몸통 -->
    <path d="M 50 100 C 49 88, 53 75, 62 64 C 70 53, 84 45, 100 44 C 117 43, 132 51, 142 64 C 151 76, 153 90, 153 105 C 154 122, 149 138, 138 152 C 127 165, 113 173, 100 173 C 87 173, 72 167, 61 154 C 51 141, 49 124, 50 100 Z" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>
    <!-- 하이라이트 -->
    <ellipse cx="74" cy="68" rx="11" ry="14" fill="${SKIN_LIGHT}" opacity="0.6" transform="rotate(-18 74 68)"/>
    <!-- calm 표정 -->
    <ellipse cx="86" cy="112" rx="3.4" ry="3.8" fill="${OUTLINE}"/>
    <ellipse cx="114" cy="112" rx="3.4" ry="3.8" fill="${OUTLINE}"/>
    <path d="M94 124 Q100 129 106 124" stroke="${OUTLINE}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="76" cy="125" rx="6" ry="3" fill="${CHEEK}" opacity="0.6"/>
    <ellipse cx="124" cy="125" rx="6" ry="3" fill="${CHEEK}" opacity="0.6"/>
  </g>
`;

// 한글 텍스트는 시스템 폴백 폰트(Windows: Malgun Gothic, macOS: Apple SD Gothic Neo)
// 로 렌더된다. sharp/librsvg는 빌드 머신의 fontconfig를 사용하므로 두 OS 모두에
// 기본 설치된 한글 폰트가 자동 매칭된다.
const KO_FONT_FAMILY =
  "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans CJK KR', sans-serif";

// Header — 150x57. 좌측 작은 모하(48px) + 우측 "모하심" 한글 워드마크.
const HEADER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <rect width="150" height="57" fill="${BG}"/>
  <g transform="translate(6, 4) scale(0.245)">
    ${POTATO_GROUP}
  </g>
  <text x="64" y="35" font-family="${KO_FONT_FAMILY}" font-size="18" font-weight="700" fill="${OUTLINE}">모하심</text>
</svg>`;

// Sidebar — 164x314. 모하 캐릭터만 크게 가운데 노출 (텍스트 무).
// POTATO_GROUP은 200x200 viewBox 기준 — scale 0.7로 140x140 정사각 노출.
// 위/아래 87px 여백, 좌/우 12px 여백으로 시각 중앙 정렬.
const SIDEBAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <rect width="164" height="314" fill="${BG}"/>
  <g transform="translate(12, 87) scale(0.7)">
    ${POTATO_GROUP}
  </g>
</svg>`;

/**
 * SVG → 24-bit BMP (NSIS Modern UI 호환). 알파는 cream BG에 합성하여 평면화.
 *
 * 화질 향상: sharp `density` 옵션으로 SVG → raster 변환 시 DPI를 384(=72*5.33)로
 * 올려 4× 크기로 supersampling한 뒤 lanczos3 커널로 정확한 BMP 사이즈(w×h)로
 * 다운샘플링. 작은 사이드바/헤더에서도 모하 라인이 매끄럽게 보존된다.
 */
async function svgToBmp(svg, w, h, outFile) {
  const { data: rgba, info } = await sharp(Buffer.from(svg), { density: 384 })
    .resize(w, h, { kernel: "lanczos3" })
    .flatten({ background: BG })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== w || info.height !== h) {
    throw new Error(
      `[installer-art-gen] sharp produced ${info.width}x${info.height}, expected ${w}x${h}`,
    );
  }

  const encoded = encodeBmp24(rgba, w, h);
  await fs.writeFile(outFile, encoded);
  console.log(
    `  ${path.basename(outFile)} (${w}×${h}, 24-bit) — ${(encoded.length / 1024).toFixed(1)} KB`,
  );
}

async function main() {
  console.log("[installer-art-gen] generating...");
  await fs.mkdir(OUT_DIR, { recursive: true });

  await svgToBmp(HEADER_SVG, 150, 57, path.join(OUT_DIR, "header.bmp"));
  await svgToBmp(SIDEBAR_SVG, 164, 314, path.join(OUT_DIR, "sidebar.bmp"));

  console.log("[installer-art-gen] done.");
}

main().catch((err) => {
  console.error("[installer-art-gen] failed:", err);
  process.exit(1);
});
