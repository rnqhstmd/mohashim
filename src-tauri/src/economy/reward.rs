//! 세션 완료 보상 산출 (Phase 22 FR-14, FR-23, P-E10).
//!
//! 순수 함수 — store/atomic/IO 무의존. 단위 테스트로 임계값 80/60 경계 검증 (FR-23, AC-21).

/// 세션 평균 점수에서 새싹 보상 수를 산출한다 (FR-14, P-E10).
///
/// - `avg_score >= 80`: 5🌱
/// - `avg_score >= 60`: 3🌱
/// - 그 외: 1🌱 (최소 보상)
///
/// Focus tick 평균만 입력 — Break tick 제외는 `score::shared::accumulate_session_score`에서
/// 분리되어 있다 (BR-4, P-E9). 본 함수는 입력값을 그대로 임계값 비교만 수행.
pub fn compute_session_reward(avg_score: u32) -> u32 {
    if avg_score >= 80 {
        5
    } else if avg_score >= 60 {
        3
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::compute_session_reward;

    /// FR-23 / AC-21: 0점 → 1🌱 (최소 보상).
    #[test]
    fn zero_score_returns_one() {
        assert_eq!(compute_session_reward(0), 1);
    }

    /// FR-23 / AC-21: 59점 → 1🌱 (60 임계값 미만).
    #[test]
    fn fifty_nine_returns_one() {
        assert_eq!(compute_session_reward(59), 1);
    }

    /// FR-23 / AC-21: 60점 → 3🌱 (60 임계값).
    #[test]
    fn sixty_returns_three() {
        assert_eq!(compute_session_reward(60), 3);
    }

    /// FR-23 / AC-21: 79점 → 3🌱 (80 임계값 미만).
    #[test]
    fn seventy_nine_returns_three() {
        assert_eq!(compute_session_reward(79), 3);
    }

    /// FR-23 / AC-21: 80점 → 5🌱 (80 임계값).
    #[test]
    fn eighty_returns_five() {
        assert_eq!(compute_session_reward(80), 5);
    }

    /// FR-23: 100점 → 5🌱 (상한).
    #[test]
    fn hundred_returns_five() {
        assert_eq!(compute_session_reward(100), 5);
    }
}
