import { useEffect, useState } from "react";
import {
  getBreakMinutes,
  getFocusMinutes,
  setBreakMinutes,
  setFocusMinutes,
} from "../../lib/storage";

/**
 * 집중/휴식 분 입력 검증 (설계 §14, FR-22d).
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
  if (fStr.trim() === "" || bStr.trim() === "") return false;
  const f = Number(fStr);
  const b = Number(bStr);
  if (!Number.isInteger(f) || !Number.isInteger(b)) return false;
  if (f < 5 || f > 90) return false;
  if (b < 3 || b > 30) return false;
  if (f === savedF && b === savedB) return false;
  return true;
}

/**
 * Settings 내부의 집중/휴식 분 편집기.
 *
 * 마운트 시 1회 store read → savedFocus/savedBreak 보관.
 * 저장 후 saved* state를 갱신하여 dirty=false로 즉시 비활성.
 *
 * 진행 중 세션에는 미반영 — atomic TIME_LEFT_SECS는 focus_start 시점에만 set된다.
 */
export function DurationsEditorScreen() {
  const [savedFocus, setSavedFocus] = useState<number>(25);
  const [savedBreak, setSavedBreak] = useState<number>(5);
  const [focusInput, setFocusInput] = useState<string>("25");
  const [breakInput, setBreakInput] = useState<string>("5");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const enabled = loaded && !saving && canSave(
    focusInput,
    breakInput,
    savedFocus,
    savedBreak
  );

  const handleSave = async () => {
    if (!enabled) return;
    setSaving(true);
    try {
      const f = Number(focusInput);
      const b = Number(breakInput);
      // 마지막 호출에서 flush — 디스크 I/O 1회로 묶는다.
      await setFocusMinutes(f, { save: false });
      await setBreakMinutes(b, { save: true });
      setSavedFocus(f);
      setSavedBreak(b);
    } catch (err) {
      console.error("[mohashim] durations save failed", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-sm font-bold text-deep">세션 시간 설정</h2>

      <label className="flex items-center justify-between text-xs text-deep/80">
        <span>집중 (5–90분)</span>
        <input
          type="number"
          min={5}
          max={90}
          step={1}
          value={focusInput}
          onChange={(e) => setFocusInput(e.target.value)}
          className="w-20 rounded-md border border-deep/20 bg-white px-2 py-1 text-right text-sm"
        />
      </label>

      <label className="flex items-center justify-between text-xs text-deep/80">
        <span>휴식 (3–30분)</span>
        <input
          type="number"
          min={3}
          max={30}
          step={1}
          value={breakInput}
          onChange={(e) => setBreakInput(e.target.value)}
          className="w-20 rounded-md border border-deep/20 bg-white px-2 py-1 text-right text-sm"
        />
      </label>

      <button
        type="button"
        onClick={() => {
          void handleSave();
        }}
        disabled={!enabled}
        className="mt-1 self-end rounded-md bg-deep px-4 py-2 text-xs text-white disabled:opacity-50"
      >
        저장
      </button>
    </div>
  );
}
