//! Phase 2 Score 통합 테스트.
//!
//! BR-9 항등식 검증(AC-5): 임의 idle×db 1000 샘플에서
//! work ∈ 0..=80, noise ∈ 0..=20, total = work + noise ∈ 0..=100.
//!
//! AC-1, AC-2 경계값도 lib 외부 노출 경로를 통해 재검증한다.

use mohashim_lib::score::{noise::noise_score, work::work_score};

#[test]
fn br9_total_is_within_zero_to_hundred_for_random_inputs() {
    // 결정적 LCG로 1000개 샘플 생성 (테스트 reproducibility).
    let mut seed: u64 = 0xdead_beef_cafe_babe;
    for _ in 0..1000 {
        seed = seed
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);

        let idle = (seed >> 32) % 600; // 0..=599
        let db_bits = (seed & 0xFFFF_FFFF) as u32;
        let db_raw = f32::from_bits(db_bits);
        let db = if db_raw.is_finite() {
            (db_raw % 200.0).abs()
        } else {
            50.0
        };

        let work = work_score(idle);
        let noise = noise_score(db);
        let total = work + noise;

        assert!(work <= 80, "work out of range: idle={idle} → work={work}");
        assert!(noise <= 20, "noise out of range: db={db} → noise={noise}");
        assert!(total <= 100, "total out of range: total={total}");
    }
}

#[test]
fn ac1_work_score_specific_boundaries() {
    assert_eq!(work_score(0), 80);
    assert_eq!(work_score(180), 80);
    assert_eq!(work_score(181), 80);
    assert_eq!(work_score(189), 80);
    assert_eq!(work_score(190), 75);
    assert_eq!(work_score(360), 0);
    assert_eq!(work_score(1000), 0);
}

#[test]
fn ac2_noise_score_specific_boundaries() {
    assert_eq!(noise_score(0.0), 20);
    assert_eq!(noise_score(65.0), 20);
    assert_eq!(noise_score(66.0), 18);
    assert_eq!(noise_score(72.5), 10);
    assert_eq!(noise_score(79.0), 2);
    assert_eq!(noise_score(80.0), 0);
    assert_eq!(noise_score(100.0), 0);
}
