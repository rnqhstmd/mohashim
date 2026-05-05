use serde::Serialize;

/// 세션 phase. 본 Phase에서는 항상 Idle (외부 트리거는 lifecycle Phase로 이월).
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Idle,
    Focus,
    Break,
    Complete,
    Discarded,
}

/// Grace Period 상태 (BR-2).
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum GraceState {
    Active,
    Looking,
    Gone,
}

/// 5단계 라이브 상태 (BR-1).
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum LiveState {
    Focused,
    Calm,
    Distracted,
    Covering,
    Stressed,
}

/// total → LiveState 매핑 (BR-1, AC-6).
/// 81~100=Focused / 61~80=Calm / 41~60=Distracted / 21~40=Covering / 0~20=Stressed.
pub fn state_from_total(total: u8) -> LiveState {
    match total {
        81..=100 => LiveState::Focused,
        61..=80 => LiveState::Calm,
        41..=60 => LiveState::Distracted,
        21..=40 => LiveState::Covering,
        _ => LiveState::Stressed,
    }
}

/// (seconds_idle, work) → GraceState (BR-2, AC-12).
/// work=0 → Gone, idle <= 180 → Active, 그 외 → Looking.
pub fn grace_from(seconds_idle: u64, work: u8) -> GraceState {
    if work == 0 {
        return GraceState::Gone;
    }
    if seconds_idle <= 180 {
        GraceState::Active
    } else {
        GraceState::Looking
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ac6_state_from_total_boundaries() {
        // AC-6 10개.
        assert_eq!(state_from_total(0), LiveState::Stressed);
        assert_eq!(state_from_total(20), LiveState::Stressed);
        assert_eq!(state_from_total(21), LiveState::Covering);
        assert_eq!(state_from_total(40), LiveState::Covering);
        assert_eq!(state_from_total(41), LiveState::Distracted);
        assert_eq!(state_from_total(60), LiveState::Distracted);
        assert_eq!(state_from_total(61), LiveState::Calm);
        assert_eq!(state_from_total(80), LiveState::Calm);
        assert_eq!(state_from_total(81), LiveState::Focused);
        assert_eq!(state_from_total(100), LiveState::Focused);
    }

    #[test]
    fn ac12_grace_from_boundaries() {
        // AC-12 4개.
        assert_eq!(grace_from(0, 80), GraceState::Active);
        assert_eq!(grace_from(180, 80), GraceState::Active);
        assert_eq!(grace_from(181, 80), GraceState::Looking);
        assert_eq!(grace_from(300, 0), GraceState::Gone);
    }
}
