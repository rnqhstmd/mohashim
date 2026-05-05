#!/usr/bin/env node
// 트레이 아이콘 자산 변환 파이프라인 (FR-A2~A5, AC-T1, T3, T4, T8).
//
// 입력: src/assets/tray-master/potato-{state}.svg (5장, viewBox 0 0 22 22).
// 출력:
//   - macOS:  src-tauri/icons/tray/mac/potato-{state}@{1x,2x,3x}.png
//             단색화(검정 RGB + alpha 보존) + ICC 미포함 sRGB.
//   - Windows: src-tauri/icons/tray/win/potato-{state}.ico
//              16/22/32/48 px 멀티 해상도.
//
// 실행: node scripts/tray-gen.mjs (또는 npm run tray:gen).

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const STATES = ["focused", "calm", "distracted", "covering", "stressed"];

const MASTER_DIR = path.resolve(__dirname, "..", "src/assets/tray-master");
const TRAY_DIR = path.resolve(__dirname, "..", "src-tauri/icons/tray");
const MAC_DIR = path.join(TRAY_DIR, "mac");
const WIN_DIR = path.join(TRAY_DIR, "win");

const MAC_SIZES = [
  { factor: 1, px: 22 },
  { factor: 2, px: 44 },
  { factor: 3, px: 66 },
];

const WIN_SIZES = [16, 22, 32, 48];

const SVG_DENSITY = 384;

function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function ensureCleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function renderMacPng(svgPath, px) {
  // 1) SVG → 컬러 PNG (정밀도 위해 density 384).
  const colored = await sharp(svgPath, { density: SVG_DENSITY })
    .resize(px, px)
    .png()
    .toBuffer();

  // 2) alpha 채널만 raw 추출.
  const alphaRaw = await sharp(colored)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer();

  // 3) 검정 RGB 3채널 raw (R=G=B=0).
  const blackRgb = Buffer.alloc(px * px * 3, 0);

  // 4) RGB(black) + alpha 결합 → ICC 미포함 PNG.
  // raw RGB 입력은 ICC 프로파일이 없으며, toColourspace/withMetadata 호출 시
  // sharp가 sRGB ICC를 자동 삽입할 수 있어 둘 다 제거한다 (AC-T8).
  return await sharp(blackRgb, {
    raw: { width: px, height: px, channels: 3 },
  })
    .joinChannel(alphaRaw, {
      raw: { width: px, height: px, channels: 1 },
    })
    .keepMetadata(false)
    .png({ palette: false, compressionLevel: 9, force: true })
    .toBuffer();
}

async function buildMacForState(state) {
  const svgPath = path.join(MASTER_DIR, `potato-${state}.svg`);
  try {
    await fs.access(svgPath);
  } catch {
    throw new Error(`[tray-gen] master SVG not found: ${svgPath}`);
  }

  for (const { factor, px } of MAC_SIZES) {
    let buf;
    try {
      buf = await renderMacPng(svgPath, px);
    } catch (err) {
      throw new Error(
        `[tray-gen] mac render failed for state=${state} @${factor}x: ${err.message}`,
      );
    }
    const outPath = path.join(MAC_DIR, `potato-${state}@${factor}x.png`);
    await fs.writeFile(outPath, buf);
    console.log(
      `[tray-gen] generated mac/potato-${state}@${factor}x.png (${px}x${px}, ICC=none, ${fmtKB(buf.length)})`,
    );
  }
}

async function buildWinForState(state) {
  const svgPath = path.join(MASTER_DIR, `potato-${state}.svg`);
  try {
    await fs.access(svgPath);
  } catch {
    throw new Error(`[tray-gen] master SVG not found: ${svgPath}`);
  }

  let pngs;
  try {
    pngs = await Promise.all(
      WIN_SIZES.map((s) =>
        sharp(svgPath, { density: SVG_DENSITY })
          .resize(s, s)
          .png()
          .toBuffer(),
      ),
    );
  } catch (err) {
    throw new Error(
      `[tray-gen] win png render failed for state=${state}: ${err.message}`,
    );
  }

  let ico;
  try {
    ico = await pngToIco(pngs);
  } catch (err) {
    throw new Error(
      `[tray-gen] win ico assembly failed for state=${state}: ${err.message}`,
    );
  }

  const outPath = path.join(WIN_DIR, `potato-${state}.ico`);
  await fs.writeFile(outPath, ico);
  console.log(
    `[tray-gen] generated win/potato-${state}.ico (${WIN_SIZES.join("/")}, ${fmtKB(ico.length)})`,
  );
}

async function main() {
  const startedAt = Date.now();

  await ensureCleanDir(MAC_DIR);
  await ensureCleanDir(WIN_DIR);

  let pngCount = 0;
  let icoCount = 0;

  for (const state of STATES) {
    await buildMacForState(state);
    pngCount += MAC_SIZES.length;
  }

  for (const state of STATES) {
    await buildWinForState(state);
    icoCount += 1;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(
    `[tray-gen] done — ${pngCount} PNG, ${icoCount} ICO in ${elapsed}s`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
