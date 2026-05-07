# Fonts

본 문서는 mohashim에 번들/배치되는 폰트의 출처, 라이센스, 배치 경로를 안내한다 (Phase 18 FR-E1~E3, K).

## Pretendard (기본)

- **Path**: `src/assets/fonts/Pretendard-{Regular,Medium,Bold,ExtraBold}.woff2`
- **License**: SIL Open Font License 1.1
- **Source**: https://github.com/orioncactus/pretendard

`@font-face` 선언은 `src/styles.css`의 4개 weight(400/500/700/800)로 등록되어 있으며, Tailwind
`fontFamily.pretendard` 체인은 `Pretendard` → `-apple-system` → `BlinkMacSystemFont` →
`Apple SD Gothic Neo` → `sans-serif` 폴백 순서를 따른다. 본문/UI 전반의 기본 글꼴이다.

## KyoboHandwriting2019 (TodoItem 라벨)

- **Path**: `src/assets/fonts/KyoboHandwriting2019.woff` (Phase 20에서 저장소 동봉)
- **License**: 교보문고 무료 한글 폰트. 인쇄·웹·모바일·광고·영상 + 앱 임베딩 허용.
  수정/이름 변경/재배포/상업 양도/재판매 금지. 본 프로젝트는 앱 내부 임베딩 용도만 사용.
- **Source**: noonnu npm 패키지 `@noonnu/kyobo-hand` v0.1.0 (교보문고 — 12살 어린이의 동글동글 글씨)
  - npm: https://www.npmjs.com/package/@noonnu/kyobo-hand
  - 원출처: https://noonnu.cc/font_page/419
  - 교보문고 공식: https://store.kyobobook.co.kr/handwriting/font
- **Fallback**: 파일 부재 시 `@font-face` fetch 404 → Tailwind `fontFamily.kyobo`
  체인의 `Pretendard`로 자연 폴백 (Phase 17 FR-D2 / BR-D). 코드 수정 없이 동작한다.

배치 절차 (이미 Phase 20에서 완료):

1. `npm install --save-dev @noonnu/kyobo-hand` 또는 tarball 직접 다운로드
   (`https://registry.npmjs.org/@noonnu/kyobo-hand/-/kyobo-hand-0.1.0.tgz`).
2. tarball의 `package/fonts/kyobohand-normal.woff`를 `src/assets/fonts/KyoboHandwriting2019.woff`로 복사.
3. `npm run build` 또는 `npm run dev`로 재빌드.

`TodoItem` 라벨 등 `fontFamily.kyobo`를 사용하는 영역이 손글씨로 렌더된다.
파일을 삭제하면 자동으로 Pretendard 폴백으로 회귀한다.
