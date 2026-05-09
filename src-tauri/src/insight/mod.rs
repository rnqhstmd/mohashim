//! 월간 인사이트 진입점 (Phase 26 FR-14~18, BR-1, MA-3, MA-4).
//!
//! lib.rs::setup에서 `tauri::async_runtime::spawn` 안의 동기 호출로 진입한다 (MA-3).
//! 부팅 블로킹 회피 — 메인 스레드는 spawn 직후 다음 단계 진행, monthly_check는 별도
//! 런타임에서 동기 처리.
//!
//! 한계 명시 (MA-4 + storage.rs::yearly_cleanup 정합):
//! - 1년 이상 비활성 후 부팅 시 yearly_cleanup이 직전 연도 데이터를 삭제하므로,
//!   누락 기간이 연 단위를 넘는 경우 일부 달은 0세션으로 처리될 수 있음.
//! - lib.rs는 monthly_check를 yearly_cleanup보다 먼저 spawn 내에서 실행하여
//!   12월 31일~1월 1일 경계의 데이터 손실을 차단한다 (FR-18).

pub mod buckets;
pub mod templates;

use chrono::{Datelike, Local};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::mailbox::append_letter_and_emit;
use crate::mailbox::state::Letter;
use crate::storage::STORE_FILE;

use buckets::{analyze_monthly_pattern, MonthlyAnalysis};
use templates::{render_letter_body, render_letter_title_with_analysis};

/// 현재 연월을 "YYYY-MM" 형식으로 반환 (Local 기준).
fn current_year_month() -> String {
    let now = Local::now();
    format!("{:04}-{:02}", now.year(), now.month())
}

/// `from`(exclusive) ~ `to`(exclusive) 사이의 모든 "YYYY-MM" 문자열을 반환 (MA-4).
///
/// `months_strictly_between("2026-02", "2026-05")` → `["2026-03", "2026-04"]`
/// `from >= to`이거나 인접(예: "2026-04" → "2026-05") 시 빈 Vec.
/// 파싱 실패 시 빈 Vec (호출자가 None 케이스로 흡수).
fn months_strictly_between(from: &str, to: &str) -> Vec<String> {
    let (from_y, from_m) = match parse_year_month(from) {
        Some(p) => p,
        None => return Vec::new(),
    };
    let (to_y, to_m) = match parse_year_month(to) {
        Some(p) => p,
        None => return Vec::new(),
    };
    // from_total < to_total 조건에서만 진행. (Phase 26 BR-1: 동월 멱등은 호출자 처리)
    let from_total = (from_y as i64) * 12 + (from_m as i64);
    let to_total = (to_y as i64) * 12 + (to_m as i64);
    if from_total + 1 >= to_total {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut cur = from_total + 1;
    while cur < to_total {
        let y = cur / 12;
        let m = cur % 12;
        // m=0일 때는 12월(전년).
        let (yy, mm) = if m == 0 { (y - 1, 12) } else { (y, m) };
        out.push(format!("{:04}-{:02}", yy, mm));
        cur += 1;
    }
    out
}

fn parse_year_month(ym: &str) -> Option<(u32, u32)> {
    let mut it = ym.split('-');
    let y = it.next()?.parse::<u32>().ok()?;
    let m = it.next()?.parse::<u32>().ok()?;
    if !(1..=12).contains(&m) {
        return None;
    }
    Some((y, m))
}

/// "YYYY-MM" 다음 달 산출. 12월 → 다음 해 1월. 파싱 실패 시 None.
///
/// monthly_check에서 직전 달 포함을 위한 호출부 보정용 (Phase 26 self-check Critical 수정).
/// months_strictly_between은 양 끝 exclusive이므로, 직전 달까지 포함하려면
/// to 인자로 next_year_month(current)를 전달해야 한다.
fn next_year_month(ym: &str) -> Option<String> {
    let (y, m) = parse_year_month(ym)?;
    let (next_y, next_m) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    Some(format!("{:04}-{:02}", next_y, next_m))
}

/// `last_monthly_letter_year_month` read.
///
/// 비문자열/부재 시 None.
fn read_last_monthly_year_month<R: Runtime>(store: &tauri_plugin_store::Store<R>) -> Option<String> {
    let raw = store.get("last_monthly_letter_year_month")?;
    raw.as_str().map(String::from)
}

/// `last_monthly_letter_year_month` write — store.save()는 호출자가 묶음 처리.
fn write_last_monthly_year_month<R: Runtime>(
    store: &tauri_plugin_store::Store<R>,
    year_month: &str,
) {
    store.set("last_monthly_letter_year_month", json!(year_month));
}

/// session_logs read (Rust 내부 read-only).
fn read_session_logs<R: Runtime>(store: &tauri_plugin_store::Store<R>) -> Vec<Value> {
    let raw = match store.get("session_logs") {
        Some(v) => v,
        None => return Vec::new(),
    };
    raw.as_array().cloned().unwrap_or_default()
}

/// MonthlyAnalysis → Letter 변환 (BR-2: id = `ml-monthly-{YYYY-MM}`).
fn build_letter(analysis: &MonthlyAnalysis, year_month: &str) -> Letter {
    let id = format!("ml-monthly-{}", year_month);
    let title = render_letter_title_with_analysis(analysis, year_month);
    let body = render_letter_body(analysis, year_month);
    let created_at = Local::now().to_rfc3339();
    Letter {
        id,
        kind: "MONTHLY".to_string(),
        title,
        body,
        created_at,
        read: false,
        session_tag: None,
    }
}

/// 월간 인사이트 체크 + 발송 진입점 (FR-14~18, BR-1, MA-4).
///
/// 호출자: lib.rs::setup의 `tauri::async_runtime::spawn` 안. 동기 시그니처 유지 —
/// spawn된 async 블록 안에서 동기 호출되므로 awaitable 불필요.
///
/// 알고리즘 (MA-4 다중 달 순회):
/// - last == None: 최초 부팅 — 발송 없이 last만 갱신 (재발송 방지).
/// - last == current: 멱등 no-op (BR-1, FR-15).
/// - last < current: months_strictly_between(last, current) 순회하며 각 달 분석.
///   - 분석 결과가 Some이면 Letter 생성 + append_letter_and_emit 발송.
///   - None(0세션)이면 발송 생략 (FR-2).
///   - 마지막에 last 갱신 (FR-16, FR-17).
pub fn monthly_check<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let last_opt = read_last_monthly_year_month(&store);
    let current = current_year_month();

    match last_opt.as_deref() {
        Some(l) if l == current => {
            // BR-1 / FR-15: 동월 재부팅 멱등.
            return Ok(());
        }
        Some(l) => {
            // MA-4: last < current인 모든 중간 달 + 직전 달 순회.
            // months_strictly_between은 양 끝 exclusive이므로, 직전 달(current 직전)을
            // 포함하려면 to 인자로 next_year_month(current)를 전달해야 한다.
            // 예: last="2026-04", current="2026-05" → scan_to="2026-06" → ["2026-05"]?
            //     아니다. (l, scan_to) exclusive = l 직후 ~ scan_to 직전 = "2026-05"까지.
            //     즉 current까지 inclusive 효과. (Phase 26 self-check Critical 수정)
            let scan_to = next_year_month(&current).unwrap_or_else(|| current.clone());
            let logs = read_session_logs(&store);
            for ym in months_strictly_between(l, &scan_to) {
                if let Some(analysis) = analyze_monthly_pattern(&logs, &ym) {
                    let letter = build_letter(&analysis, &ym);
                    append_letter_and_emit(app, letter);
                }
                // FR-2 / FR-17: None이면 발송 생략, 마지막 last 갱신은 동일 처리.
            }
        }
        None => {
            // 최초 부팅 — 발송 없이 last만 갱신하여 재발송 차단.
        }
    }

    // FR-16/17: 발송 여부와 무관하게 current로 갱신 (멱등 가드 시드).
    write_last_monthly_year_month(&store, &current);
    store
        .save()
        .map_err(|e| format!("store save failed: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_year_month_format() {
        let ym = current_year_month();
        // "YYYY-MM" 형식 (7자).
        assert_eq!(ym.len(), 7);
        assert!(ym.chars().nth(4) == Some('-'));
        let (y, m) = parse_year_month(&ym).expect("parsable");
        assert!(y >= 2026);
        assert!((1..=12).contains(&m));
    }

    #[test]
    fn months_strictly_between_normal() {
        let r = months_strictly_between("2026-02", "2026-05");
        assert_eq!(r, vec!["2026-03", "2026-04"]);
    }

    #[test]
    fn months_strictly_between_adjacent_returns_empty() {
        // 직전 달과 현재 달이 인접 — 사이에 달 없음.
        let r = months_strictly_between("2026-04", "2026-05");
        assert_eq!(r, Vec::<String>::new());
    }

    #[test]
    fn months_strictly_between_same_returns_empty() {
        let r = months_strictly_between("2026-04", "2026-04");
        assert_eq!(r, Vec::<String>::new());
    }

    #[test]
    fn months_strictly_between_year_boundary() {
        let r = months_strictly_between("2025-11", "2026-02");
        assert_eq!(r, vec!["2025-12", "2026-01"]);
    }

    #[test]
    fn months_strictly_between_invalid_returns_empty() {
        assert!(months_strictly_between("invalid", "2026-05").is_empty());
        assert!(months_strictly_between("2026-04", "invalid").is_empty());
        assert!(months_strictly_between("2026-13", "2026-15").is_empty());
    }

    #[test]
    fn parse_year_month_valid() {
        assert_eq!(parse_year_month("2026-04"), Some((2026, 4)));
        assert_eq!(parse_year_month("2025-12"), Some((2025, 12)));
    }

    #[test]
    fn parse_year_month_invalid() {
        assert_eq!(parse_year_month("2026"), None);
        assert_eq!(parse_year_month("2026-00"), None);
        assert_eq!(parse_year_month("2026-13"), None);
        assert_eq!(parse_year_month("xx-04"), None);
    }

    #[test]
    fn next_year_month_normal() {
        assert_eq!(next_year_month("2026-04"), Some("2026-05".to_string()));
        assert_eq!(next_year_month("2026-01"), Some("2026-02".to_string()));
    }

    #[test]
    fn next_year_month_year_boundary() {
        assert_eq!(next_year_month("2026-12"), Some("2027-01".to_string()));
    }

    #[test]
    fn next_year_month_invalid() {
        assert_eq!(next_year_month("2026-13"), None);
        assert_eq!(next_year_month("2026-00"), None);
        assert_eq!(next_year_month("invalid"), None);
        assert_eq!(next_year_month("2026"), None);
    }

    #[test]
    fn monthly_check_scan_range_includes_previous_month() {
        // Critical 회귀 검증: last="2026-04", current="2026-05"이면
        // scan_to="2026-06" → months_strictly_between("2026-04", "2026-06") = ["2026-05"]
        // 직전 달(=current)이 분석 대상에 포함되어야 함.
        let current = "2026-05";
        let scan_to = next_year_month(current).expect("valid current");
        let scanned = months_strictly_between("2026-04", &scan_to);
        assert_eq!(scanned, vec!["2026-05"]);
    }

    #[test]
    fn monthly_check_scan_range_includes_multiple_missed_months() {
        // last="2026-01", current="2026-04"이면 scan_to="2026-05"
        // → ["2026-02", "2026-03", "2026-04"] (직전 달까지 inclusive)
        let current = "2026-04";
        let scan_to = next_year_month(current).expect("valid current");
        let scanned = months_strictly_between("2026-01", &scan_to);
        assert_eq!(scanned, vec!["2026-02", "2026-03", "2026-04"]);
    }
}
