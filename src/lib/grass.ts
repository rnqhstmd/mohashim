/**
 * Grass 도메인 로직 (Phase 8).
 *
 * 잔디 시각화에 필요한 상수/타입/순수 함수 및 공유 카드 합성 파이프라인을 제공한다.
 */
import type { SessionRecord } from "./storage";
import { getSessions, getSessionLogs } from "./storage";

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
 * Phase 22+ 갱신: 총 집중 시간 + 할 일 완료 수 + 평균 점수 보너스로 레벨 산출.
 *
 * 사용자 피드백: 25분×6 vs 50분×3가 시간 동일한데 레벨이 다른 형평성 문제 → 시간 베이스로 통일.
 * "타이머만 / 할 일만 / 둘 다" 세 사용 패턴 모두 공정 평가하도록 통합 가중치 모델 적용.
 *
 * 공식:
 * ```
 * points = focusMins/30 + todos/2 + (avg >= 80 ? 0.25 : 0)
 * ```
 *
 * 레벨 임계값:
 * - 활동 없음 (sessions=0, todos=0) → 0
 * - points 3.5+ → 4 (예: 2시간 집중만, todo 8개만, 1시간+todo 3+평균 85점)
 * - points 2.5~3.5 → 3
 * - points 1.5~2.5 → 2
 * - points 0~1.5 (활동 있음) → 1
 *
 * `focusMins`는 그 날의 모든 세션 duration_mins 합계.
 * `todos`/`focusMins` default 0 — 기존 레거시 호환.
 */
export function gridLevel(
  sessions: number,
  avg: number,
  todos: number = 0,
  focusMins: number = 0,
): GrassLevel {
  if (sessions === 0 && todos === 0) return 0;
  const timePoints = focusMins / 30;
  const todoPoints = todos / 2;
  const scoreBonus = avg >= 80 ? 0.25 : 0;
  const total = timePoints + todoPoints + scoreBonus;
  if (total >= 3.5) return 4;
  if (total >= 2.5) return 3;
  if (total >= 1.5) return 2;
  return 1;
}

/** BR-G4: 로컬 시간대 기준 'YYYY-MM-DD' 포맷. UTC 사용 금지. */
export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * Phase 13 FR-8: 날짜 헤딩 — "2026년 5월 6일 화요일" 형식.
 * 로컬 시간대 기준. zero-padding 없음 (헤딩은 자연 표기).
 */
export function formatDateHeading(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = WEEKDAY_KO[d.getDay()];
  return `${y}년 ${m}월 ${day}일 ${dow}요일`;
}

/** 12시간제 "오전/오후 h:mm" 포맷. 0시는 12로 표기 (BR-4 로컬 시간대). */
function formatHM12(d: Date): string {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const period = h >= 12 ? "오후" : "오전";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${period} ${h12}:${mm}`;
}

/** 종료 시각 — period 생략 "h:mm" 포맷 (시작 시각과 페어 표기 시 가독성). */
function formatHM12End(d: Date): string {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm}`;
}

/**
 * Phase 13 FR-9: 세션 시각 — "오전/오후 h:mm~h:mm" 형식 (12시간제, 로컬).
 *
 * PR #14 리뷰 (Copilot): 시작/종료의 period(오전·오후) 또는 일자가 다르면 종료에도
 * period를 표기하여 11:50~12:15 같은 경계 케이스의 모호성을 제거한다.
 * 같은 period면 종료는 "h:mm"으로 간결.
 *
 * RFC3339 입력 파싱 실패 시 빈 문자열 반환 (UI 측 안전 폴백).
 */
export function formatSessionTime(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const startHasAfternoon = start.getHours() >= 12;
  const endHasAfternoon = end.getHours() >= 12;
  const sameDay = start.toDateString() === end.toDateString();
  const periodChanged = !sameDay || startHasAfternoon !== endHasAfternoon;
  const endStr = periodChanged ? formatHM12(end) : formatHM12End(end);
  return `${formatHM12(start)}~${endStr}`;
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

  // Phase 22+ 잔디 레벨 산출에 그 날 총 집중 시간(duration_mins 합)이 필요.
  // SessionLog를 함께 로드해 날짜별 합산 맵 생성.
  const [sessions, sessionLogs] = await Promise.all([getSessions(), getSessionLogs()]);
  const focusMinsByDate: Record<string, number> = {};
  for (const log of sessionLogs) {
    focusMinsByDate[log.date] = (focusMinsByDate[log.date] ?? 0) + (log.duration_mins ?? 0);
  }

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
    const fm = focusMinsByDate[dateStr] ?? 0;
    cells.push({
      date: dateStr,
      sessions: s,
      avg: a,
      todos: t,
      level: isFuture ? 0 : gridLevel(s, a, t, fm),
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
