//! Mailbox IPC + record_session_letter + plugin actions (Phase 23, FR-2~14).
//!
//! `mailbox` 키 단일 writer (P-D4): TS는 `getMailbox()` read-only만 노출.
//! MAILBOX_MUTEX로 read-mutate-write 직렬화 (MUST-2).

pub mod notifier;
pub mod state;

use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::Local;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_store::StoreExt;

use crate::storage::STORE_FILE;
use notifier::{lock_mailbox, push_message, LAST_NOTIF_AT_MS, NOTIF_DEEPLINK_WINDOW_MS};
use state::{append_with_cap, mark_all_read_in_place, read_mailbox, write_mailbox, Letter};

/// 세션 완료 편지 생성 + store persist + 알림 발화 + mailbox-updated emit (FR-3, FR-5, FR-7).
///
/// **호출 계약 (Phase 23 CRITICAL)**: 반드시 `store_phase(Phase::Idle)` +
/// `write_active_phase("idle")` 이후에 호출해야 한다. push_message 내부 phase 판정이
/// Idle로 통과하여 즉시 발화 분기로 진입한다. 순서 위반 시 세션 완료 알림이 보류 큐에
/// 들어가 drain 트리거가 손실된다.
///
/// `end_ms` (BR-3): on_complete_consumed의 end_ms 값. session_log id(`sl-{end_ms}-{avg}`)와
/// mailbox letter id(`ml-{end_ms}`)가 동일 시각 기준을 공유한다.
///
/// `start_ms` (FR-5): FOCUS_START_AT_MS 값 (focus 세션 시작 시각). 0이면 fallback으로
/// `now - focus_mins`를 사용 (break_minutes 오프셋 발생 가능 — 정상 흐름에서는 0이 아님).
pub fn record_session_letter<R: Runtime>(
    app: &AppHandle<R>,
    end_ms: u64,
    start_ms: u64,
    score: u32,
    focus_mins: u32,
    todos_done: usize,
    session_tag: Option<&str>,
) {
    use chrono::TimeZone;

    let now = Local::now();
    // BR-3: id는 on_complete_consumed의 end_ms 기반 — session_log id와 시각 기준 동일.
    let id = format!("ml-{}", end_ms);

    // 편지 제목: "{HH:MM}~{HH:MM} 집중 완료" (FR-5).
    // start_ms 사용 시 정확한 focus 시작 시각 → focus_end = start + focus_mins.
    // start_ms=0 fallback 시 break_minutes만큼 시각 밀림 발생 (정상 흐름에서는 도달 안 함).
    let (title_start, title_end) = if start_ms > 0 {
        let s = Local
            .timestamp_millis_opt(start_ms as i64)
            .single()
            .unwrap_or(now);
        let e = s + chrono::Duration::minutes(focus_mins as i64);
        (s, e)
    } else {
        let e = now;
        let s = e - chrono::Duration::minutes(focus_mins as i64);
        (s, e)
    };
    let title = format!(
        "{}~{} 집중 완료",
        title_start.format("%H:%M"),
        title_end.format("%H:%M")
    );

    // 🌱 보상 계산 (economy FR-14 임계값 동일).
    let earned = crate::economy::reward::compute_session_reward(score);

    // 편지 본문 (FR-5 양식: 5요소 + 줄바꿈 1회 + session_tag 1줄).
    let body = match session_tag {
        Some(tag) => format!(
            "총 {}분 / 집중도 평균 {}점 / 평균 소음 0dB / 완료한 할 일 {}개 / 🌱 +{}\n#{}",
            focus_mins, score, todos_done, earned, tag
        ),
        None => format!(
            "총 {}분 / 집중도 평균 {}점 / 평균 소음 0dB / 완료한 할 일 {}개 / 🌱 +{}",
            focus_mins, score, todos_done, earned
        ),
    };

    let letter = Letter {
        id,
        kind: "SESSION".to_string(),
        title: title.clone(),
        body: body.clone(),
        created_at: now.to_rfc3339(),
        read: false,
        session_tag: session_tag.map(String::from),
    };

    // MAILBOX_MUTEX: read-mutate-write 직렬화 (MUST-2, P-D4).
    // push_message + emit은 mutex 해제 전이지만 두 함수 모두 MAILBOX_MUTEX를 요구하지 않으므로 safe.
    let _guard = lock_mailbox();
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[mohashim] mailbox record_session_letter store open failed: {e}");
            return;
        }
    };
    let mut letters = read_mailbox(&store);
    append_with_cap(&mut letters, letter);
    write_mailbox(&store, &letters);
    if let Err(e) = store.save() {
        eprintln!("[mohashim] mailbox store save failed: {e}");
    }
    push_message(app, &title, &body);
    if let Err(e) = app.emit("mailbox-updated", ()) {
        eprintln!("[mohashim] mailbox-updated emit failed: {e}");
    }
}

/// 편지함 전체 조회 IPC (FR-10, AC-1).
#[tauri::command]
pub async fn get_mailbox<R: Runtime>(app: AppHandle<R>) -> Result<Vec<Letter>, String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    Ok(read_mailbox(&store))
}

/// 편지함 전체 읽음 처리 IPC (FR-9, AC-7 멱등, AC-20 즉시 뱃지 해제).
#[tauri::command]
pub async fn mark_all_mailbox_read<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let changed = {
        let _guard = lock_mailbox();
        let store = app
            .store(STORE_FILE)
            .map_err(|e| format!("store open failed: {e}"))?;
        let mut letters = read_mailbox(&store);
        if mark_all_read_in_place(&mut letters) {
            write_mailbox(&store, &letters);
            store
                .save()
                .map_err(|e| format!("store save failed: {e}"))?;
            true
        } else {
            false
        }
    };
    // AC-20: MailboxScreen 진입 후 mark_all_read 완료 시 MainScreen 뱃지 즉시 해제.
    // 멱등 no-op(이미 모두 read)인 경우에도 emit하여 일관성 유지 (수신측은 read 카운트 재계산).
    if changed {
        if let Err(e) = app.emit("mailbox-updated", ()) {
            eprintln!("[mohashim] mark_all_mailbox_read emit failed: {e}");
        }
    }
    Ok(())
}

/// 개별 편지 읽음 처리 IPC (FR-9 파생, AC-7).
#[tauri::command]
pub async fn mark_mailbox_letter_read<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<(), String> {
    let _guard = lock_mailbox();
    let store = app
        .store(STORE_FILE)
        .map_err(|e| format!("store open failed: {e}"))?;
    let mut letters = read_mailbox(&store);
    let mut changed = false;
    for l in letters.iter_mut() {
        if l.id == id && !l.read {
            l.read = true;
            changed = true;
            break;
        }
    }
    if changed {
        write_mailbox(&store, &letters);
        store
            .save()
            .map_err(|e| format!("store save failed: {e}"))?;
    }
    Ok(())
}

/// OS 알림 액션 타입 등록 (FR-8, Plugin actions API 인프라).
///
/// Phase 23 MVP: no-op. tauri-plugin-notification v2 Rust-side ActionType 등록은
/// 플랫폼별 JS 브릿지로 처리되며, Phase 24에서 deeplink 심화 구현 예정.
pub fn register_notification_actions<R: Runtime>(_app: &AppHandle<R>) -> Result<(), String> {
    Ok(())
}

/// OS 알림 클릭 핸들러 설치 (FR-8 minimal, BR-9).
///
/// Phase 23 minimal 휴리스틱:
/// - notifier::send_now 성공 시 `LAST_NOTIF_AT_MS`에 시각 기록.
/// - 메인 윈도우 focus 이벤트 수신 시 LAST_NOTIF_AT_MS와 비교하여 NOTIF_DEEPLINK_WINDOW_MS
///   (10초) 이내이면 알림 클릭으로 추정 → mailbox-deeplink emit + LAST_NOTIF_AT_MS swap(0).
///
/// **제약**: 사용자가 알림 발화 직후 트레이/dock 등으로 수동 focus 시에도 trigger 가능 (false positive).
/// **제약**: letter_id 전달 미지원 (현재 가장 최신 편지로 라우팅하는 단순화).
/// Phase 24에서 tauri-plugin-notification action API 또는 별도 채널로 정확한 trigger 구현 예정.
pub fn install_notification_action_handler<R: Runtime>(app: &AppHandle<R>) {
    let app_clone = app.clone();
    if let Some(window) = app.get_webview_window("main") {
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(true) = event {
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                // swap(0) — 1회 사용 후 reset하여 동일 알림에 대한 중복 deeplink 차단.
                let last = LAST_NOTIF_AT_MS.swap(0, Ordering::AcqRel);
                if last > 0 && now_ms.saturating_sub(last) < NOTIF_DEEPLINK_WINDOW_MS {
                    if let Err(e) = app_clone.emit("mailbox-deeplink", json!({})) {
                        eprintln!("[mohashim] mailbox-deeplink emit failed: {e}");
                    }
                }
            }
        });
    } else {
        eprintln!(
            "[mohashim] mailbox: main window unavailable for notification action handler"
        );
    }
}
