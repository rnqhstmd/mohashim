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
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_store::StoreExt;

use crate::mailbox::append_letters_to_store_locked;
use crate::mailbox::notifier::{lock_mailbox, push_message};
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

/// 월간 인사이트 체크 + 발송 진입점 (FR-14~18, BR-1, MA-4, Phase 27 FR-10/MA-2).
///
/// 호출자: lib.rs::setup의 `tauri::async_runtime::spawn` 안. 동기 시그니처 유지 —
/// spawn된 async 블록 안에서 동기 호출되므로 awaitable 불필요.
///
/// 알고리즘 (Phase 26 PR review Critical 수정 + MA-4 다중 달 순회):
/// - last == None: 최초 부팅 — 발송 없이 last만 갱신 (재발송 방지).
/// - last == current: 멱등 no-op (BR-1, FR-15).
/// - last < current: cur=last부터 시작해 cur < current인 동안 각 달을 분석.
///   - last 자체는 "마지막 부팅한 연월"이며 그 부팅에서 last의 직전 달 편지가 이미
///     발송되었다. 이번 부팅은 last의 데이터부터 current 직전 달까지를 발송 대상으로 삼는다.
///   - 예: last="2026-04", current="2026-05" → cur=4월 → 4월 발송 → cur=5월 (loop exit).
///         **현재 진행 중인 5월은 분석 대상에서 제외** (PRD FR-15).
///   - 예: last="2026-02", current="2026-05" → 2월/3월/4월 발송, 5월 제외.
///
/// **Phase 27 MA-2 단일 트랜잭션** (FR-10):
/// 1. lock_mailbox() 1회 획득.
/// 2. mailbox in-memory mutate (append_letters_to_store_locked).
/// 3. last_monthly_letter_year_month in-memory mutate.
/// 4. store.save() 1회 — mailbox와 last 키의 부분 실패 윈도우 0 (BR-1 100% 멱등).
/// 5. 락 해제 후 push_message + emit 1회 발화 (락 외부에서 OS 알림 발사).
///
/// **Phase 27 FR-8 정책 주석**: 다중 달 순회 중 일부 분석이 None을 반환해도 last는 항상
/// current로 갱신된다. 이는 의도적 — 다음 부팅에서 동일 달을 재시도하지 않아 멱등성을 보장.
/// 실패 분석은 영구 None(통계 부재)이라는 가정에 기반한다.
pub fn monthly_check<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let last_opt = read_last_monthly_year_month(&store);
    // Phase 27 FR-15 timezone 코멘트:
    // current_year_month()는 Local::now()를 사용한다. 호스트 OS의 timezone이 변경되면
    // (예: 사용자가 비행기로 시간대 이동) 같은 부팅 내에서 month boundary 판정이 달라질
    // 수 있다. 부팅 시점 1회 호출이므로 race는 발생하지 않으며, 다음 부팅에서 새 timezone
    // 기준으로 정상 멱등 동작.
    let current = current_year_month();

    // 분석 대상 letters를 lock 외부에서 미리 빌드 — 락 보유 시간 최소화.
    let letters: Vec<Letter> = match last_opt.as_deref() {
        Some(l) if l == current => {
            // BR-1 / FR-15: 동월 재부팅 멱등 — 발송도 last 갱신도 모두 no-op.
            return Ok(());
        }
        Some(l) => {
            let logs = read_session_logs(&store);
            let mut acc: Vec<Letter> = Vec::new();
            let mut cur = l.to_string();
            while cur < current {
                if let Some(analysis) = analyze_monthly_pattern(&logs, &cur) {
                    acc.push(build_letter(&analysis, &cur));
                }
                // FR-2 / FR-17: None이면 발송 생략하고 다음 달로 진행.
                // FR-8: 일부 None이어도 다음 달 진행 + 마지막에 last를 current로 갱신 (재시도 차단).
                if let Some(next) = next_year_month(&cur) {
                    cur = next;
                } else {
                    break;
                }
            }
            acc
        }
        None => {
            // 최초 부팅 — 발송 없이 last만 갱신하여 재발송 차단.
            Vec::new()
        }
    };

    // push_message용으로 (title, body) 미리 복제 (락 해제 후 발화).
    let titles_bodies: Vec<(String, String)> = letters
        .iter()
        .map(|l| (l.title.clone(), l.body.clone()))
        .collect();

    // Phase 27 MA-2: 단일 lock + 단일 save 트랜잭션.
    {
        let _guard = lock_mailbox();
        // 1. mailbox in-memory mutate — letters 비어있으면 helper 내부에서 즉시 return.
        append_letters_to_store_locked(&store, &letters);
        // 2. last_monthly_letter_year_month in-memory mutate (FR-10, MA-2 Phase 27).
        write_last_monthly_year_month(&store, &current);
        // 3. 단일 save — 부분 실패 차단 (BR-1 100% 멱등).
        store
            .save()
            .map_err(|e| format!("store save failed: {e}"))?;
    }

    // 4. 락 해제 후 push_message + emit. 알림 발화 실패는 UX 비차단 (notifier 내부 eprintln).
    for (title, body) in &titles_bodies {
        push_message(app, title, body);
    }
    if !letters.is_empty() {
        if let Err(e) = app.emit("mailbox-updated", ()) {
            eprintln!("[mohashim] monthly_check mailbox-updated emit failed: {e}");
        }
    }
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

    /// monthly_check 본문 while 루프와 동일한 순회 로직 — 분석 대상 연월 목록을 도출한다.
    /// (Phase 26 PR review Critical 수정 검증용 헬퍼.)
    fn collect_scanned_months(last: &str, current: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut cur = last.to_string();
        while cur.as_str() < current {
            out.push(cur.clone());
            if let Some(next) = next_year_month(&cur) {
                cur = next;
            } else {
                break;
            }
        }
        out
    }

    #[test]
    fn monthly_check_processes_previous_month_only() {
        // Critical 회귀 검증: last="2026-04", current="2026-05"이면
        // 분석 대상 = ["2026-04"] — last 자체가 발송 대상이며,
        // **현재 진행 중인 5월은 제외** (PRD FR-15).
        let scanned = collect_scanned_months("2026-04", "2026-05");
        assert_eq!(scanned, vec!["2026-04"]);
    }

    #[test]
    fn monthly_check_processes_multiple_missed_months_excluding_current() {
        // last="2026-01", current="2026-04"이면
        // 분석 대상 = ["2026-01", "2026-02", "2026-03"] — current 직전까지, current는 제외.
        let scanned = collect_scanned_months("2026-01", "2026-04");
        assert_eq!(scanned, vec!["2026-01", "2026-02", "2026-03"]);
    }

    #[test]
    fn monthly_check_excludes_current_month_from_scan() {
        // current 자체는 분석 대상에서 제외되어야 함 (FR-15 핵심).
        // last="2026-02", current="2026-05" → ["2026-02", "2026-03", "2026-04"]
        // — 5월은 진행 중이므로 분석 대상 아님.
        let scanned = collect_scanned_months("2026-02", "2026-05");
        assert!(!scanned.contains(&"2026-05".to_string()));
        assert_eq!(scanned, vec!["2026-02", "2026-03", "2026-04"]);
    }

    #[test]
    fn monthly_check_year_boundary_scan() {
        // 연 경계 검증: last="2025-11", current="2026-02"이면
        // 분석 대상 = ["2025-11", "2025-12", "2026-01"] — 2026-02는 제외.
        let scanned = collect_scanned_months("2025-11", "2026-02");
        assert_eq!(scanned, vec!["2025-11", "2025-12", "2026-01"]);
    }
}
