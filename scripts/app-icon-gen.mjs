#!/usr/bin/env node
// Mohashim 앱 아이콘 생성기 (Phase 21).
//
// 핵심 결정 (이중 squircle 버그 회피):
//   - 단순 솔리드 사각형 → macOS가 default backdrop 덧칠 → 이중 squircle.
//   - 단순 transparent corners + 자체 squircle path → 동일 이중 형태.
//   - 해결: Apple HIG에 가까운 cornerRadius로 rounded rect 그려서 macOS의
//     squircle mask와 거의 일치시키고, transparent corners를 두지 않는다.
//
// 1024×1024 캔버스. 디자인의 cream squircle을 rx=ry=232 (≈ 22.65%)로 그려
// Apple Big Sur+ 시스템 squircle과 시각적으로 매칭.

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ICON_DIR = path.resolve(__dirname, "..", "src-tauri/icons");

// Design palette
const BG = "#fef3d8";
const SKIN = "#fdeed1";
const SKIN_LIGHT = "#fff7e3";
const OUTLINE = "#5a3d1f";
const CHEEK = "#f9c4b0";
const SPROUT = "#7dc89a";

// Apple HIG macOS app icon은 1024 캔버스 + 824 visible squircle (100px padding)
// 또는 1024 캔버스에 cornerRadius ≈ 22.65% (≈232) rounded rect로 그릴 수 있다.
// 사용자 시각 검증으로 후자가 macOS rendering과 자연스럽게 호환됨.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <!-- 1024 squircle (Apple HIG cornerRadius 22.65%) -->
  <rect x="0" y="0" width="1024" height="1024" rx="232" ry="232" fill="${BG}"/>

  <!-- Potato 손그림 (popup.jsx line 287 MohashimAppIcon scale 4) -->
  <g transform="translate(112, 100) scale(4)">
    <!-- 새싹 stem -->
    <path d="M100 38 Q99.5 28 100 22" stroke="${OUTLINE}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <!-- 새싹 잎 -->
    <path d="M99 24 Q90 18 84 8 Q88 9 93 12 Q98 18 101 23 Z" fill="${SPROUT}" stroke="${OUTLINE}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M101 24 Q110 18 116 8 Q112 9 107 12 Q102 18 99 23 Z" fill="${SPROUT}" stroke="${OUTLINE}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>

    <!-- 몸통 hand-drawn body -->
    <path d="M 50 100 C 49 88, 53 75, 62 64 C 70 53, 84 45, 100 44 C 117 43, 132 51, 142 64 C 151 76, 153 90, 153 105 C 154 122, 149 138, 138 152 C 127 165, 113 173, 100 173 C 87 173, 72 167, 61 154 C 51 141, 49 124, 50 100 Z" fill="${SKIN}" stroke="${OUTLINE}" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>

    <!-- 하이라이트 -->
    <ellipse cx="74" cy="68" rx="11" ry="14" fill="${SKIN_LIGHT}" opacity="0.6" transform="rotate(-18 74 68)"/>

    <!-- calm 표정 — 점눈 + 굵은 미소 + cheek -->
    <ellipse cx="86" cy="112" rx="3.4" ry="3.8" fill="${OUTLINE}"/>
    <ellipse cx="114" cy="112" rx="3.4" ry="3.8" fill="${OUTLINE}"/>
    <path d="M94 124 Q100 129 106 124" stroke="${OUTLINE}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="76" cy="125" rx="6" ry="3" fill="${CHEEK}" opacity="0.6"/>
    <ellipse cx="124" cy="125" rx="6" ry="3" fill="${CHEEK}" opacity="0.6"/>
  </g>
</svg>`;

async function genPng(size, outFile) {
  await sharp(Buffer.from(SVG))
    .resize(size, size)
    .png({ quality: 100, compressionLevel: 9, palette: false })
    .toFile(outFile);
  const stat = await fs.stat(outFile);
  console.log(`  ${path.basename(outFile)} (${size}×${size}) — ${(stat.size / 1024).toFixed(1)} KB`);
}

async function main() {
  console.log("[app-icon-gen] generating...");
  await fs.mkdir(ICON_DIR, { recursive: true });

  await genPng(32, path.join(ICON_DIR, "32x32.png"));
  await genPng(128, path.join(ICON_DIR, "128x128.png"));
  await genPng(256, path.join(ICON_DIR, "128x128@2x.png"));
  await genPng(512, path.join(ICON_DIR, "icon.png"));

  await fs.writeFile(path.join(ICON_DIR, "icon.svg"), SVG);
  console.log(`  icon.svg saved`);

  // Windows resource compiler (tauri-build) + NSIS Modern UI 둘 다 만족해야 한다.
  // NSIS 3.x는 PNG-compressed ICO entry를 지원하지 않으므로, png-to-ico가 PNG로
  // 인코딩하는 256+ 사이즈를 제외하고 32/128만 포함 (둘 다 BMP entry).
  // 256 이상이 빠져도 Windows shell은 128을 자동 스케일링하여 표시한다.
  const icoBuf = await pngToIco([
    path.join(ICON_DIR, "32x32.png"),
    path.join(ICON_DIR, "128x128.png"),
  ]);
  const icoPath = path.join(ICON_DIR, "icon.ico");
  await fs.writeFile(icoPath, icoBuf);
  console.log(`  icon.ico saved — ${(icoBuf.length / 1024).toFixed(1)} KB`);

  console.log("[app-icon-gen] done.");
}

main().catch((err) => {
  console.error("[app-icon-gen] failed:", err);
  process.exit(1);
});
