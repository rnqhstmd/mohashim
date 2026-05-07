import { useEffect, useState } from "react";
import {
  getBreakMinutes,
  getFocusMinutes,
  setBreakMinutes,
  setFocusMinutes,
} from "../../lib/storage";
import { DiscardChangesModal } from "./DiscardChangesModal";

type DurationsEditScreenProps = { onClose: () => void };

// Phase 17 BR-4: 기존 DurationsEditorScreen 5~90/3~30 → 1~180/1~60.
// timer.rs FOCUS_MINUTES_MIN/MAX, BREAK_MINUTES_MIN/MAX와 정합.
const FOCUS_MIN = 1;
const FOCUS_MAX = 180;
const BREAK_MIN = 1;
const BREAK_MAX = 60;

/**
 * 단일 입력값(분 문자열)이 정수이며 [min,max] 범위 내인지 검증 (FR-E3).
 *
 * - 빈 문자열 / 공백 / 비정수(소수, 문자 등) / 범위 외 → false.
 */
export function isValidDuration(input: string, min: number, max: number): boolean {
  const trimmed = input.trim();
  if (trimmed === "") return false;
  // PR phase-review 반영: 지수 표기(1e2) / 소수점 / 음수 / 부호 등 거부.
  // Number()는 "1e2"=100, "+5"=5 등을 통과시키므로 명시적 정수 문자열만 허용.
  if (!/^\d+$/.test(trimmed)) return false;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return false;
  if (n < min || n > max) return false;
  return true;
}

/**
 * 집중/휴식 분 입력 검증 (FR-E4, BR-4).
 *
 * - 빈 문자열, 비정수, 범위 초과: 비활성.
 * - 저장값과 동일(dirty=false): 비활성.
 */
export function canSave(
  fStr: string,
  bStr: string,
  savedF: number,
  savedB: number
): boolean {
  if (!isValidDuration(fStr, FOCUS_MIN, FOCUS_MAX)) return false;
  if (!isValidDuration(bStr, BREAK_MIN, BREAK_MAX)) return false;
  const f = Number(fStr);
  const b = Number(bStr);
  if (f === savedF && b === savedB) return false;
  return true;
}

/**
 * 집중/휴식 분 편집 화면 (Phase 17 B2-E, FR-E3~E7).
 *
 * - 마운트 시 1회 store read → savedF/savedB + focusInput/breakInput 초기화.
 * - lastValidFocus/lastValidBreak: 유효 입력이 들어올 때마다 갱신, onBlur에서 자동 복구에 사용.
 * - onChange는 raw string state. onBlur 시 invalid면 lastValid로 복구 (FR-E5).
 * - 저장: setFocusMinutes(save:false) → setBreakMinutes(save:true)로 디스크 I/O 1회.
 * - dirty 상태에서 뒤로가기 시 DiscardChangesModal 1회 표시.
 */
export function DurationsEditScreen({ onClose }: DurationsEditScreenProps) {
  const [savedFocus, setSavedFocus] = useState<number>(25);
  const [savedBreak, setSavedBreak] = useState<number>(5);
  const [focusInput, setFocusInput] = useState<string>("25");
  const [breakInput, setBreakInput] = useState<string>("5");
  const [lastValidFocus, setLastValidFocus] = useState<number>(25);
  const [lastValidBreak, setLastValidBreak] = useState<number>(5);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [f, b] = await Promise.all([
          getFocusMinutes(),
          getBreakMinutes(),
        ]);
        if (cancelled) return;
        setSavedFocus(f);
        setSavedBreak(b);
        setFocusInput(String(f));
        setBreakInput(String(b));
        setLastValidFocus(f);
        setLastValidBreak(b);
      } catch (err) {
        console.error("[mohashim] durations load failed", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const focusValid = isValidDuration(focusInput, FOCUS_MIN, FOCUS_MAX);
  const breakValid = isValidDuration(breakInput, BREAK_MIN, BREAK_MAX);
  const enabled = loaded && !saving && canSave(
    focusInput,
    breakInput,
    savedFocus,
    savedBreak
  );
  const isDirty =
    focusInput !== String(savedFocus) || breakInput !== String(savedBreak);

  const handleFocusChange = (v: string) => {
    setFocusInput(v);
    if (isValidDuration(v, FOCUS_MIN, FOCUS_MAX)) {
      setLastValidFocus(Number(v));
    }
  };

  const handleBreakChange = (v: string) => {
    setBreakInput(v);
    if (isValidDuration(v, BREAK_MIN, BREAK_MAX)) {
      setLastValidBreak(Number(v));
    }
  };

  const handleFocusBlur = () => {
    if (!isValidDuration(focusInput, FOCUS_MIN, FOCUS_MAX)) {
      setFocusInput(String(lastValidFocus));
    }
  };

  const handleBreakBlur = () => {
    if (!isValidDuration(breakInput, BREAK_MIN, BREAK_MAX)) {
      setBreakInput(String(lastValidBreak));
    }
  };

  const handleSave = async () => {
    if (!enabled) return;
    setSaving(true);
    try {
      const f = Number(focusInput);
      const b = Number(breakInput);
      await setFocusMinutes(f, { save: false });
      await setBreakMinutes(b, { save: true });
      setSavedFocus(f);
      setSavedBreak(b);
      onClose();
    } catch (err) {
      console.error("[mohashim] durations save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (isDirty) setDiscardOpen(true);
    else onClose();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-deep/10 px-4 py-3">
        <button
          type="button"
          onClick={handleBack}
          className="text-sm text-deep"
        >
          ← 시간 편집
        </button>
        <div className="w-12" />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <label className="flex items-center justify-between text-xs text-deep/80">
            <span>집중 시간 ({FOCUS_MIN}~{FOCUS_MAX}분)</span>
            <input
              type="number"
              min={FOCUS_MIN}
              max={FOCUS_MAX}
              step={1}
              value={focusInput}
              onChange={(e) => handleFocusChange(e.target.value)}
              onBlur={handleFocusBlur}
              className="w-20 rounded-md border border-deep/20 bg-white px-2 py-1 text-right text-sm"
            />
          </label>
          {!focusValid && focusInput.trim() !== "" && (
            <p className="text-xs text-red-600">
              {FOCUS_MIN}~{FOCUS_MAX}분 사이로 입력해주세요
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="flex items-center justify-between text-xs text-deep/80">
            <span>휴식 시간 ({BREAK_MIN}~{BREAK_MAX}분)</span>
            <input
              type="number"
              min={BREAK_MIN}
              max={BREAK_MAX}
              step={1}
              value={breakInput}
              onChange={(e) => handleBreakChange(e.target.value)}
              onBlur={handleBreakBlur}
              className="w-20 rounded-md border border-deep/20 bg-white px-2 py-1 text-right text-sm"
            />
          </label>
          {!breakValid && breakInput.trim() !== "" && (
            <p className="text-xs text-red-600">
              {BREAK_MIN}~{BREAK_MAX}분 사이로 입력해주세요
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={!enabled}
          className="mt-2 self-end rounded-md bg-deep px-4 py-2 text-xs text-white disabled:opacity-50"
        >
          저장
        </button>
      </div>

      <DiscardChangesModal
        open={discardOpen}
        onConfirm={() => {
          setDiscardOpen(false);
          onClose();
        }}
        onCancel={() => setDiscardOpen(false)}
      />
    </div>
  );
}
