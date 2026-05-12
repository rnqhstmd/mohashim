<div align="center">

<img src="src-tauri/icons/128x128.png" alt="모하심 아이콘" width="100"/>

# 모하심 (Mohashim)

**감자 캐릭터 '모하'가 내 집중력을 지켜봐 주는 Mac/Windows 생산성 앱**

[![GitHub release](https://img.shields.io/github/v/release/rnqhstmd/mohashim?style=flat-square&logo=github)](https://github.com/rnqhstmd/mohashim/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/rnqhstmd/mohashim/release.yml?style=flat-square&label=CI&logo=github-actions)](https://github.com/rnqhstmd/mohashim/actions)
[![License](https://img.shields.io/github/license/rnqhstmd/mohashim?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square)](https://github.com/rnqhstmd/mohashim/releases/latest)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-FFC131?style=flat-square&logo=tauri&logoColor=white)](https://v2.tauri.app)

</div>

---

## 다운로드

<div align="center">

<table>
  <tr>
    <td align="center" width="240">
      <a href="https://github.com/rnqhstmd/mohashim/releases/latest/download/Mohashim.dmg">
        <img src="https://img.shields.io/badge/macOS-다운로드_(.dmg)-000000?style=for-the-badge&logo=apple&logoColor=white"/>
      </a>
      <br/>
      <sub>macOS 12 Monterey 이상</sub>
    </td>
    <td align="center" width="240">
      <a href="https://github.com/rnqhstmd/mohashim/releases/latest/download/Mohashim_Windows.msi">
        <img src="https://img.shields.io/badge/Windows-다운로드_(.msi)-0078D4?style=for-the-badge&logo=windows&logoColor=white"/>
      </a>
      <br/>
      <sub>Windows 10 이상</sub>
    </td>
  </tr>
</table>

</div>

> **macOS 첫 실행 시** — "개발자를 확인할 수 없음" 경고가 뜰 수 있습니다.
> `시스템 설정 → 개인정보 보호 및 보안`에서 **그래도 열기**를 눌러주세요. ([자세히 →](#-faq))

---

<div align="center">

| 🎯 하이브리드 집중도 측정 | 🍅 포모도로 타이머 | 🌱 잔디 그래프 |
|:---:|:---:|:---:|
| 키보드·마우스 + 마이크 소음<br/>실시간 0~100점 복합 분석 | 집중 25분 → 휴식 5분<br/>세션 완료 시 잔디 자동 기록 | 최근 28일 GitHub 스타일<br/>히트맵 시각화 |

| 🥔 감자 캐릭터 '모하' | 🌿 새싹 경제 시스템 | 💌 편지함 |
|:---:|:---:|:---:|
| 5단계 표정으로 집중도 반응<br/>메뉴바 아이콘도 실시간 연동 | 세션·출석 보상 새싹 획득<br/>상점에서 캐릭터 꾸미기 | 세션 완료·출석·구매 영수증<br/>맞춤형 칭찬 편지 수신 |

| 📋 할 일 관리 | 📊 월간 인사이트 | 🔒 완전 로컬 저장 |
|:---:|:---:|:---:|
| 태그 기반 작업 관리<br/>EMA 작업 점수 | 태그별 집중 패턴 분석<br/>월간 리포트 | 모든 데이터 내 컴퓨터에만<br/>외부 서버 전송 없음 |

</div>

---

## 이런 분께 추천해요

- 공부·작업 중 딴짓을 줄이고 싶은 분
- 포모도로를 쓰지만 "진짜 집중했는지" 불안한 분
- 오늘 얼마나 집중했는지 한눈에 확인하고 싶은 분

---

## 주요 기능

### 🎯 집중도 측정 — 키보드·마우스 + 마이크 하이브리드

키보드·마우스 활동(최대 80점)과 마이크 주변 소음(최대 20점)을 1초마다 복합 분석합니다. 실제로 손을 움직이고, 조용한 환경에서 집중할수록 높은 점수를 받습니다.

### 🍅 포모도로 타이머

집중(25분) → 휴식(5분) → 세션 완료 사이클을 자동으로 전환합니다. 세션이 끝나면 OS 알림으로 알려드리고, 완료된 세션은 잔디에 기록됩니다. 집중/휴식 시간은 설정에서 자유롭게 조절할 수 있습니다.

### 🌱 잔디 그래프

최근 28일간의 집중 세션을 GitHub 스타일 히트맵으로 시각화합니다. 하루에 많이, 집중도 높게 완료할수록 진한 색으로 표시됩니다.

### 🥔 감자 캐릭터 '모하'

집중도에 따라 5단계 표정으로 반응하고, 상황에 맞는 멘트로 동기를 줍니다. 메뉴바/트레이 아이콘도 함께 바뀌어 한눈에 내 상태를 확인할 수 있습니다.

- **집중** — 눈을 반짝이며 열심히 일하는 모하
- **평온** — 잔잔하게 집중 중인 모하
- **산만** — 슬슬 딴짓이 느껴지는 모하
- **숨김** — 자리를 비운 사이 기다리는 모하
- **스트레스** — 시끄러운 환경에서 힘들어하는 모하

### 🌿 새싹 경제 시스템

열심히 집중한 만큼 새싹(🌱)을 모아 캐릭터를 꾸밀 수 있습니다.

| 획득 방법 | 새싹 |
|-----------|------|
| 세션 완료 (낮은 점수) | 🌱 ×1 |
| 세션 완료 (보통 점수) | 🌱 ×3 |
| 세션 완료 (높은 점수) | 🌱 ×5 |
| 일별 출석 보상 | 🌱 ×1 |

모은 새싹은 **상점**에서 사용합니다. 스킨, 표정 아이템 등 9종의 캐릭터 아이템을 구매하고 장착하면 실시간으로 모하에게 적용됩니다.

### 💌 편지함 — 모하의 손편지

세 가지 종류의 편지를 받을 수 있습니다.

- **세션 완료 편지** — 집중 점수에 따라 달라지는 맞춤형 칭찬과 응원
- **출석 보상 편지** — 새싹 보상과 함께 도착하는 출석 환영 메시지
- **영수증 편지** — 상점에서 아이템 구매 시 발급되는 구매 영수증

### 📋 할 일 관리

태그 기반으로 할 일을 분류하고 위치 태그도 추가할 수 있습니다. EMA(지수이동평균) 작업 점수로 꾸준한 할 일 완료 패턴을 추적합니다.

### 📊 월간 인사이트

태그별 집중 패턴을 분석해 어떤 종류의 작업에 얼마나 집중했는지 월간 리포트로 확인할 수 있습니다.

### 🖼️ 잔디 자랑하기

한 달 잔디 그래프를 1080×1080 PNG로 합성해 클립보드에 복사합니다. 가장 집중 잘 한 날, 할일 가장 많이 한 날 등 베스트 통계도 함께 담깁니다.

### 🔒 완전 로컬 저장

모든 데이터는 내 컴퓨터에만 저장됩니다. 외부 서버로 전송되지 않으며, 마이크는 dB 수치만 실시간으로 분석하고 음성 자체는 저장되지 않습니다.

---

## 어떻게 동작하나요

### 집중도 점수 (0~100)

매초 두 축의 점수를 합산합니다.

| 축 | 만점 | 산출 방식 |
|----|------|-----------|
| **활동 점수** | 80 | 키보드/마우스 입력이 없는 시간이 길어질수록 감소. 180초 이내 자리비움은 만점 유지 |
| **환경 점수** | 20 | 마이크 dB EMA가 65dBSPL 이하면 만점, 80dBSPL 초과 시 0점 |

점수에 따라 모하의 표정과 멘트가 5단계로 변합니다: 집중 → 평온 → 산만 → 숨김 → 스트레스.

### 포모도로 사이클

```
집중(25분) → 휴식(5분) → 세션 완료 → (반복)
```

집중 중 중단하면 점수는 기록되지 않습니다. 세션을 완료해야 잔디에 기록됩니다.

### 앱 상주 방식

앱은 항상 메뉴바(macOS) / 작업표시줄 트레이(Windows)에 상주합니다. 아이콘을 클릭하면 팝업이 아이콘 바로 아래/위에 정렬되어 나타납니다.

> 알고리즘과 아키텍처 상세 내용은 [개발 문서 (DEVELOPMENT.md)](DEVELOPMENT.md)에서 확인하세요.

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | React 18 · TypeScript (strict) · Vite 5 · Tailwind CSS 3 |
| 백엔드 | Rust 2021 edition · Tauri v2 |
| 입력 감지 | rdev 0.5 |
| 오디오 | cpal 0.15 · AVCaptureDevice |
| 저장소 | tauri-plugin-store (로컬 JSON) |
| 테스트 | Vitest · React Testing Library · serial_test |

---

## 기여하기

버그 리포트, 기능 제안, Pull Request 모두 환영합니다.

1. 이슈를 먼저 확인하고, 없으면 새 이슈를 열어 논의해 주세요.
2. 코드 기여는 `feat/<기능명>` 또는 `fix/<버그명>` 브랜치를 만들어 작업하세요.
3. 변경 사항에 맞는 테스트를 추가하거나 기존 테스트가 통과하는지 확인해 주세요.
4. PR을 열면 리뷰 후 병합됩니다.

개발 환경 설정과 아키텍처 이해는 [DEVELOPMENT.md](DEVELOPMENT.md)를 참고해 주세요.

---

## FAQ

<details>
<summary><b>집중도는 어떻게 측정하나요?</b></summary>

키보드·마우스 입력이 없는 시간(idle)이 길어질수록 활동 점수가 줄고, 마이크로 감지되는 주변 소음이 클수록 환경 점수가 낮아집니다. 짧은 자리비움(180초 이내)은 집중 중으로 처리되어 만점을 유지합니다.

</details>

<details>
<summary><b>새싹은 어떻게 모으나요?</b></summary>

포모도로 세션을 완료할 때마다 집중 점수에 따라 새싹 1~5개를 받습니다. 매일 앱에 접속하면 출석 보상으로 새싹 1개를 추가로 받을 수 있습니다. 모은 새싹은 상점에서 캐릭터 꾸미기 아이템을 구매하는 데 사용합니다.

</details>

<details>
<summary><b>마이크 권한이 왜 필요한가요?</b></summary>

주변 소음을 dB로 측정해 집중 환경을 평가하기 위해 사용합니다. 녹음하거나 저장하지 않으며, 음량 수치만 실시간으로 분석합니다.

</details>

<details>
<summary><b>접근성 권한이 왜 필요한가요? (macOS)</b></summary>

키보드·마우스 입력 감지를 위해 macOS 접근성 API가 필요합니다. 입력 내용(어떤 키를 눌렀는지 등)은 수집하지 않고, 활동 여부만 감지합니다.

</details>

<details>
<summary><b>데이터는 어디에 저장되나요?</b></summary>

모든 데이터는 내 컴퓨터에만 저장됩니다. 외부 서버로 전송되지 않습니다.

- macOS: `~/Library/Application Support/com.mohashim.app/`
- Windows: `%APPDATA%\com.mohashim.app\`

</details>

<details>
<summary><b>macOS에서 "개발자를 확인할 수 없음" 오류가 떠요</b></summary>

코드 서명 없이 배포된 앱에서 발생하는 macOS Gatekeeper 경고입니다.

**방법 1 — 시스템 설정 사용:**
1. `시스템 설정 → 개인정보 보호 및 보안` 이동
2. "mohashim이(가) 차단되었습니다" 옆 **그래도 열기** 클릭

**방법 2 — 터미널 사용:**
```bash
xattr -cr /Applications/Mohashim.app
```

</details>

---

<div align="center">

[개발 문서](DEVELOPMENT.md) · [이슈 / 피드백](https://github.com/rnqhstmd/mohashim/issues) · [릴리즈 노트](https://github.com/rnqhstmd/mohashim/releases)

</div>
