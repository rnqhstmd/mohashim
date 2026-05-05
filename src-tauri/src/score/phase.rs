use serde::Serialize;

/// 세션 phase. atomic 영속을 위해 u8 변환 헬퍼 제공 (PHASE_BITS).
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Idle,
    Focus,
    Break,
    Complete,
    Discarded,
}

impl Phase {
    /// Phase → u8. 0=Idle, 1=Focus, 2=Break, 3=Complete, 4=Discarded.
    pub fn as_u8(self) -> u8 {
        match self {
            Phase::Idle => 0,
            Phase::Focus => 1,
            Phase::Break => 2,
            Phase::Complete => 3,
            Phase::Discarded => 4,
        }
    }

    /// u8 → Phase. 미정의 값(99 등)은 Idle로 폴백 (atomic 손상 방어).
    pub fn from_u8(v: u8) -> Phase {
        match v {
            1 => Phase::Focus,
            2 => Phase::Break,
            3 => Phase::Complete,
            4 => Phase::Discarded,
            _ => Phase::Idle,
        }
    }
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

    #[test]
    fn phase_u8_roundtrip_all_variants() {
        for p in [
            Phase::Idle,
            Phase::Focus,
            Phase::Break,
            Phase::Complete,
            Phase::Discarded,
        ] {
            assert_eq!(Phase::from_u8(p.as_u8()), p);
        }
    }

    #[test]
    fn phase_from_u8_undefined_falls_back_to_idle() {
        assert_eq!(Phase::from_u8(5), Phase::Idle);
        assert_eq!(Phase::from_u8(99), Phase::Idle);
        assert_eq!(Phase::from_u8(255), Phase::Idle);
    }
}
