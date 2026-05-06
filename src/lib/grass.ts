/**
 * Grass 도메인 로직 (Phase 8).
 *
 * 잔디 시각화에 필요한 상수/타입/순수 함수 및 공유 카드 합성 파이프라인을 제공한다.
 */
import type { SessionRecord } from "./storage";
import { getSessions } from "./storage";

// ---------- 상수 ----------

export const GRASS_0 = "#ebedf0";
export const GRASS_1 = "#9be9a8";
export const GRASS_2 = "#40c463";
export const GRASS_3 = "#30a14e";
export const GRASS_4 = "#216e39";
export const GRASS_COLORS: readonly string[] = [GRASS_0, GRASS_1, GRASS_2, GRASS_3, GRASS_4];

export const SHARE_CARD_SIZE = 1080;

// ---------- 타입 ----------

export type GrassLevel = 0 | 1 | 2 | 3 | 4;

/** 잔디 그리드 한 칸. date=null이면 leading/trailing blank 셀. */
export type DayCell = {
  date: string | null;
  sessions: number;
  avg: number;
  /**
   * 그 날 완료한 todo 개수 (Phase 12 FR-6). 미존재 레거시 레코드는 0 폴백.
   */
  todos: number;
  level: GrassLevel;
  isFuture: boolean;
};

/** 한 달 분량 잔디 데이터. cells 길이는 항상 7의 배수. */
export type MonthData = {
  monthOffset: number;
  year: number;
  month: number; // 1~12
  cells: DayCell[];
  totalSessions: number;
  avgScore: number;
};

// ---------- 순수 함수 ----------

/**
 * BR-G1 (Phase 12 개정): 세션 수, 평균 점수, todo 완료 수로부터 잔디 레벨 산출.
 *
 * ANALYSIS.md §10-1 표 적용. 주요 변경:
 * - sessions=0이어도 todo 완료가 있으면 레벨 1~2 부여 (BR-1: 최대 레벨 2까지).
 * - sessions≥6은 점수 미달이어도 최소 레벨 3 보장 (H-5 역전 방지).
 *
 * `todos` 인자는 default 0 — 기존 호출자(레거시) 호환.
 */
export function gridLevel(
  sessions: number,
  avg: number,
  todos: number = 0
): GrassLevel {
  // sessions=0 분기: todo 기반. BR-1 — todo만으로 도달 가능한 최대 레벨은 2.
  if (sessions === 0) {
    if (todos >= 3) return 2;
    if (todos >= 1) return 1;
    return 0;
  }
  // sessions 1~2: todo 무관 레벨 1.
  if (sessions <= 2) return 1;
  // sessions ≥ 6: H-5 역전 방지 — 점수 낮아도 최소 3 보장.
  if (sessions >= 6) return avg >= 70 ? 4 : 3;
  // sessions 3~5.
  return avg >= 60 ? 3 : 2;
}

/** BR-G4: 로컬 시간대 기준 'YYYY-MM-DD' 포맷. UTC 사용 금지. */
export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * D-G4: 월별 달력 데이터 — monthOffset에 따라 해당 월 1~말일을 표시.
 * leading blank: 1일 요일(0=일~6=토)만큼.
 * trailing blank: 셀 길이가 7의 배수가 되도록 채움.
 * monthOffset === 0이고 오늘 이후 일자는 isFuture=true, level=0 강제 (BR-G7-monthly).
 */
export async function getMonthSessions(monthOffset: number): Promise<MonthData> {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = target.getFullYear();
  const monthIdx = target.getMonth(); // 0~11
  const firstDayOfWeek = target.getDay(); // 0=일~6=토
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const todayStr = formatDate(now);

  const sessions = await getSessions();

  const cells: DayCell[] = [];
  // leading blank
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push({ date: null, sessions: 0, avg: 0, todos: 0, level: 0, isFuture: false });
  }
  // 1일 ~ 말일
  let totalSessions = 0;
  let totalScoreSum = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIdx, day);
    const dateStr = formatDate(d);
    const isFuture = monthOffset === 0 && dateStr > todayStr;
    const rec: SessionRecord | undefined = sessions[dateStr];
    const s = rec?.sessions ?? 0;
    const a = rec?.avg ?? 0;
    // FR-6: todos_completed 미존재 레거시 레코드는 0 폴백.
    const t = rec?.todos_completed ?? 0;
    cells.push({
      date: dateStr,
      sessions: s,
      avg: a,
      todos: t,
      level: isFuture ? 0 : gridLevel(s, a, t),
      isFuture,
    });
    if (!isFuture) {
      totalSessions += s;
      // `sum` 필드 우선 사용. 미존재(레거시 레코드)는 avg*sessions으로 근사.
      totalScoreSum += rec?.sum ?? a * s;
    }
  }
  // trailing blank — 7의 배수
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, sessions: 0, avg: 0, todos: 0, level: 0, isFuture: false });
  }

  const avgScore = totalSessions > 0 ? Math.round(totalScoreSum / totalSessions) : 0;
  return { monthOffset, year, month: monthIdx + 1, cells, totalSessions, avgScore };
}

// ---------- 합성 파이프라인 (FR-18) ----------

/**
 * SVG 엘리먼트를 1080×1080 PNG Blob으로 합성.
 *
 * XMLSerializer → data:image/svg+xml;base64 → Image.decode → canvas → toBlob.
 * 한글 등 non-ASCII 안전을 위해 TextEncoder로 UTF-8 바이트 변환 후 base64.
 * (deprecated `unescape`/`encodeURIComponent` 패턴 대체 — PR #8 리뷰 반영)
 */
export async function composeShareCard(svgEl: SVGSVGElement): Promise<Blob> {
  const svgString = new XMLSerializer().serializeToString(svgEl);
  const bytes = new TextEncoder().encode(svgString);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const dataUrl = `data:image/svg+xml;base64,${btoa(binary)}`;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_SIZE;
  canvas.height = SHARE_CARD_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d 컨텍스트 미지원");
  ctx.drawImage(img, 0, 0, SHARE_CARD_SIZE, SHARE_CARD_SIZE);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob 실패"));
    }, "image/png");
  });
}

/**
 * PNG Blob을 OS 클립보드에 복사 (tauri-plugin-clipboard-manager v2).
 *
 * Blob → Uint8Array → writeImage(bytes).
 */
export async function copyShareCardToClipboard(blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const { writeImage } = await import("@tauri-apps/plugin-clipboard-manager");
  await writeImage(bytes);
}
