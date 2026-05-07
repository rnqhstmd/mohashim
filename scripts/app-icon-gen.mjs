#!/usr/bin/env node
// Mohashim 앱 아이콘 생성기 (Phase 21 사용자 피드백).
//
// 핵심: macOS Big Sur+는 .app 아이콘에 시스템 squircle mask를 자동 적용한다.
// SVG 안에 자체 squircle path를 그리고 corners를 transparent로 두면, macOS가
// 그 transparent 영역에 default 회색 backdrop을 덧칠하여 "이중 squircle" 형태로
// 보이는 버그가 발생한다 (사용자 스크린샷 #6 — 뒤 회색 squircle + 앞 cream squircle).
//
// 해결: 전체 1024×1024 캔버스를 solid cream으로 채우고 squircle path는 그리지 않는다.
// macOS가 시스템 mask를 입혀 깔끔한 단일 squircle 형태로 렌더된다.
//
// 출력:
//   - src-tauri/icons/32x32.png / 128x128.png / 128x128@2x.png / icon.png

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ICON_DIR = path.resolve(__dirname, "..", "src-tauri/icons");

// Design palette
const BG = "#fef3d8";
const SKIN = "#fdeed1";
const SKIN_LIGHT = "#fff7e3";
const OUTLINE = "#5a3d1f";
const CHEEK = "#f9c4b0";
const SPROUT = "#7dc89a";

// 1024x1024 viewBox. squircle path 미사용 — 전체 캔버스 solid cream 배경 → macOS가
// 자동으로 squircle mask 적용. Potato는 디자인 시안 좌표 (translate 112,100 + scale 4).
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <!-- 전체 캔버스를 solid cream으로 채움 — macOS가 squircle mask 자동 적용 -->
  <rect width="1024" height="1024" fill="${BG}"/>

  <!-- Potato 손그림 (popup.jsx line 287 MohashimAppIcon scale 4 정렬) -->
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
  console.log(`  icon.svg saved for debugging`);

  console.log("[app-icon-gen] done. Run `npm run tauri build` to bundle into .app.");
}

main().catch((err) => {
  console.error("[app-icon-gen] failed:", err);
  process.exit(1);
});
