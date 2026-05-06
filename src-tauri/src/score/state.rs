use serde::Serialize;

use super::phase::{GraceState, LiveState, Phase};

/// score-tick IPC 페이로드 (FR-12, AC-4).
/// 정확히 10개 필드만 포함한다 — 입력 내용 관련 필드 추가 금지 (BR-4).
/// Phase 11에서 `noise_loud`(camelCase: "noiseLoud") 추가 (9→10키).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScoreSnapshot {
    pub total: u8,
    pub work: u8,
    pub noise: u8,
    pub state: LiveState,
    pub db: f32,
    pub seconds_idle: u64,
    pub grace: GraceState,
    pub phase: Phase,
    pub time_left: u64,
    pub noise_loud: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn ac4_snapshot_has_exactly_ten_camelcase_keys() {
        let snap = ScoreSnapshot {
            total: 100,
            work: 80,
            noise: 20,
            state: LiveState::Focused,
            db: 50.0,
            seconds_idle: 0,
            grace: GraceState::Active,
            phase: Phase::Idle,
            time_left: 0,
            noise_loud: false,
        };
        let v = serde_json::to_value(&snap).expect("serialize");
        let obj = v.as_object().expect("object");

        // 정확히 10개 키.
        assert_eq!(obj.len(), 10, "expected 10 keys, got {}", obj.len());

        // 모든 키가 camelCase로 존재.
        for key in [
            "total",
            "work",
            "noise",
            "state",
            "db",
            "secondsIdle",
            "grace",
            "phase",
            "timeLeft",
            "noiseLoud",
        ] {
            assert!(obj.contains_key(key), "missing key: {key}");
        }

        // 페이로드 값 검증.
        assert_eq!(obj["total"], Value::from(100));
        assert_eq!(obj["state"], Value::from("focused"));
        assert_eq!(obj["grace"], Value::from("active"));
        assert_eq!(obj["phase"], Value::from("idle"));
        assert_eq!(obj["noiseLoud"], Value::from(false));
    }
}
