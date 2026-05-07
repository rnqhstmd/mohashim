#!/usr/bin/env node
// Mohashim 앱 아이콘 생성기 (Phase 21 사용자 피드백: dock 아이콘 안 보임).
//
// 디자인의 MohashimAppIcon(popup.jsx line 287) 정렬 — squircle 배경 + 손그림
// 부실감자 얼굴. SVG로 작성 후 sharp로 다중 해상도 PNG 생성.
//
// 출력:
//   - src-tauri/icons/32x32.png
//   - src-tauri/icons/128x128.png
//   - src-tauri/icons/128x128@2x.png   (256x256)
//   - src-tauri/icons/icon.png         (512x512)
//   - src-tauri/icons/icon.icns        (macOS .icns)
//
// 실행: node scripts/app-icon-gen.mjs

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ICON_DIR = path.resolve(__dirname, "..", "src-tauri/icons");

// Design palette
const SKIN = "#fdeed1";
const SKIN_LIGHT = "#fff7e3";
const OUTLINE = "#5a3d1f";
const CHEEK = "#f9c4b0";
const SPROUT = "#7dc89a";

const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff8e0"/>
      <stop offset="100%" stop-color="#fef3d8"/>
    </linearGradient>
    <clipPath id="squircle-clip">
      <path d="M512 0 C 850 0, 1024 174, 1024 512 C 1024 850, 850 1024, 512 1024 C 174 1024, 0 850, 0 512 C 0 174, 174 0, 512 0 Z"/>
    </clipPath>
  </defs>

  <!-- 배경 squircle -->
  <path d="M512 0 C 850 0, 1024 174, 1024 512 C 1024 850, 850 1024, 512 1024 C 174 1024, 0 850, 0 512 C 0 174, 174 0, 512 0 Z" fill="url(#bg)"/>

  <g clip-path="url(#squircle-clip)">
    <!-- Potato 얼굴 클로즈업 (popup.jsx line 287 MohashimAppIcon 정렬, scale 4) -->
    <g transform="translate(112, 100) scale(4)">
      <!-- 새싹 stem -->
      <path d="M100 38 Q99.5 28 100 22" stroke="${OUTLINE}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <!-- 새싹 잎 -->
      <path d="M99 24 Q90 18 84 8 Q88 9 93 12 Q98 18 101 23 Z" fill="${SPROUT}" stroke="${OUTLINE}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="M101 24 Q110 18 116 8 Q112 9 107 12 Q102 18 99 23 Z" fill="${SPROUT}" stroke="${OUTLINE}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>

      <!-- 몸통 hand-drawn body -->
      <path
        d="M 50 100 C 49 88, 53 75, 62 64 C 70 53, 84 45, 100 44 C 117 43, 132 51, 142 64 C 151 76, 153 90, 153 105 C 154 122, 149 138, 138 152 C 127 165, 113 173, 100 173 C 87 173, 72 167, 61 154 C 51 141, 49 124, 50 100 Z"
        fill="${SKIN}"
        stroke="${OUTLINE}"
        stroke-width="2.8"
        stroke-linejoin="round"
        stroke-linecap="round"
      />

      <!-- 하이라이트 -->
      <ellipse cx="74" cy="68" rx="11" ry="14" fill="${SKIN_LIGHT}" opacity="0.6" transform="rotate(-18 74 68)"/>

      <!-- calm 표정 — 점눈 + 굵은 미소 + cheek -->
      <ellipse cx="86" cy="112" rx="3.4" ry="3.8" fill="${OUTLINE}"/>
      <ellipse cx="114" cy="112" rx="3.4" ry="3.8" fill="${OUTLINE}"/>
      <path d="M94 124 Q100 129 106 124" stroke="${OUTLINE}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="76" cy="125" rx="6" ry="3" fill="${CHEEK}" opacity="0.6"/>
      <ellipse cx="124" cy="125" rx="6" ry="3" fill="${CHEEK}" opacity="0.6"/>
    </g>
  </g>

  <!-- 외곽선 -->
  <path d="M512 0 C 850 0, 1024 174, 1024 512 C 1024 850, 850 1024, 512 1024 C 174 1024, 0 850, 0 512 C 0 174, 174 0, 512 0 Z" fill="none" stroke="${OUTLINE}" stroke-width="6" opacity="0.18"/>
</svg>
`;

async function genPng(size, outFile) {
  await sharp(Buffer.from(SVG))
    .resize(size, size)
    .png({ quality: 100, compressionLevel: 9 })
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

  // .icns 생성: png-to-icns 또는 iconutil 사용. iconutil은 macOS에서만 동작.
  // sharp만으로는 .icns 직접 생성 불가 — Tauri build 시 자동으로 icon.png에서 .icns 생성 가능.
  // tauri build가 png들에서 자동으로 .icns 합성하므로 별도 .icns 파일은 생성하지 않아도 됨.

  console.log("[app-icon-gen] done. Run `npm run tauri build` to bundle into .app.");
}

main().catch((err) => {
  console.error("[app-icon-gen] failed:", err);
  process.exit(1);
});
