# Phase 1 상세 구현 설계서

> **RALPLAN-DR 구조 | 작성일: 2026-04-16**
> **기반 문서**: `docs/GAME_PLAN.md` v1.0
> **범위**: Phase 1 풀 출시 (20주)

---

## Table of Contents

1. [RALPLAN-DR](#ralplan-dr)
2. [프로젝트 구조](#1-프로젝트-구조)
3. [화면 구성 & 네비게이션](#2-화면-구성--네비게이션)
4. [상태 관리 설계 (Zustand)](#3-상태-관리-설계-zustand)
5. [Colyseus 서버 설계](#4-colyseus-서버-설계)
6. [윷판 데이터 모델](#5-윷판-데이터-모델)
7. [AI 엔진 설계](#6-ai-엔진-설계)
8. [Firebase 설계](#7-firebase-설계)
9. [렌더링 & 애니메이션 설계](#8-렌더링--애니메이션-설계)
10. [수익화 구현](#9-수익화-구현)
11. [다국어 (i18n) 설계](#10-다국어-i18n-설계)
12. [친구 초대 & 딥링크](#11-친구-초대--딥링크)
13. [이탈 방지 & 패널티 시스템](#12-이탈-방지--패널티-시스템)
14. [테스트 전략](#13-테스트-전략)
15. [CI/CD & 배포](#14-cicd--배포)

---

## RALPLAN-DR

### Principles (구현 설계 원칙)

**P1. Server-Authoritative 단일 진실 소스 (Single Source of Truth)**
모든 게임 상태 변이는 서버에서만 발생한다. 클라이언트는 서버 상태를 렌더링하는 뷰 레이어에 불과하다. 이를 통해 치팅을 원천 차단하고, 분쟁 시 서버 로그를 기준으로 판정한다.

**P2. Shared 패키지로 코드 중복 제거**
게임 로직(경로 계산, 승리 판정, 윷 확률), 타입 정의, 상수를 `shared` 패키지에 집중하여 클라이언트/서버 간 로직 불일치를 구조적으로 방지한다. AI 오프라인 모드에서도 동일한 shared 로직을 사용한다.

**P3. 애니메이션-게임로직 완전 분리**
게임 로직(상태 변이)과 애니메이션(시각적 표현)은 독립적으로 동작한다. 서버에서 상태가 변경되면 클라이언트는 변경 사항을 큐에 넣고 애니메이션을 순차 재생한다. 애니메이션이 게임 로직을 블로킹하지 않는다.

**P4. 점진적 복잡도 (Progressive Complexity)**
모든 시스템은 가장 단순한 형태로 시작하고, 필요할 때만 복잡도를 추가한다. 예: 매칭은 단순 큐에서 시작 → Glicko-2 범위 매칭 → 확장 범위 매칭 순으로 발전.

**P5. 오프라인 퍼스트 AI**
AI 대전은 네트워크 없이 완전히 동작해야 한다. shared 패키지의 게임 로직을 클라이언트에서 직접 실행하여 오프라인 게임을 지원한다.

**P6. Apple HIG 순정 디자인**
UI/UX는 **Apple Human Interface Guidelines**만 추종한다. 최대한 iOS 순정 느낌으로 설계하며, 과도한 커스텀 UI를 지양한다.
- **폰트**: SF Pro Rounded 전용 (Regular/Medium/Semibold/Bold). 다른 폰트 사용 금지.
- **컴포넌트**: iOS 네이티브 패턴 준수 (시스템 버튼 스타일, 네비게이션 바, 탭 바, 모달 시트 등)
- **색상**: iOS Dynamic Colors 활용 (라이트/다크 모드 자동 대응)
- **간격/크기**: HIG 권장 터치 타겟(44pt 최소), 8pt 그리드 시스템
- **아이콘**: SF Symbols 우선 사용
- **디자인 검증**: [impeccable](https://github.com/pbakaus/impeccable) 도구를 활용하여 디자인 품질 크리틱 수행 (`/audit`, `/critique`, `/polish` 명령)
- **범위 이원화**: 게임 캔버스(윷판, 게이지, 이펙트)는 커스텀 게임 UI 허용. 캔버스 외부(로비, 설정, 리더보드, 모달, 네비게이션)는 HIG 엄격 준수.

### Decision Drivers (Top 3)

**D1. 개발 속도 (20주 데드라인)**
모노레포 + shared 패키지로 코드 재사용을 극대화하고, Colyseus/Firebase의 내장 기능을 최대한 활용하여 커스텀 구현을 최소화한다.

**D2. 실시간 동기화 신뢰성**
윷 던지기 → 결과 → 말 이동 사이클이 sub-second 응답을 보장해야 한다. Colyseus의 delta state sync + WebSocket이 이를 충족한다.

**D3. 크로스 플랫폼 일관성**
iOS/Android에서 동일한 게임 경험을 제공해야 한다. Expo + react-native-skia + Rive가 양 플랫폼에서 일관된 렌더링을 보장한다.

### Viable Options

#### 상태 관리: Zustand vs Jotai

| 기준 | Zustand (선택) | Jotai |
|------|---------------|-------|
| 학습 곡선 | 낮음, 단순 API | 중간, 원자적 모델 |
| Colyseus 통합 | Store에서 Room 상태 미러링 용이 | 원자 분산이 Room 동기화와 불일치 |
| 디버깅 | Redux DevTools 지원 | 원자 추적이 복잡 |
| 번들 크기 | ~1KB | ~2KB |

**결정**: Zustand 채택. Colyseus Room State를 단일 GameStore에 미러링하는 패턴이 직관적이고, 팀 온보딩 비용이 낮다.

#### 윷판 렌더링: react-native-skia vs react-native-canvas vs SVG

| 기준 | react-native-skia (선택) | react-native-canvas | SVG (react-native-svg) |
|------|--------------------------|--------------------|-----------------------|
| 성능 | GPU 가속, 60fps | Canvas 2D, 중간 | DOM 기반, 저성능 |
| 인터랙션 | 터치 이벤트 네이티브 지원 | 터치 좌표 수동 계산 | 컴포넌트별 이벤트 |
| 애니메이션 통합 | Reanimated와 자연스러운 통합 | 별도 루프 필요 | Animated API 제한적 |
| 커스터마이징 | 셰이더, 블러, 그라데이션 자유 | 기본 2D만 | 필터 제한적 |

**결정**: react-native-skia 채택. GPU 가속으로 저사양 기기에서도 안정적이고, 한지/나무 텍스처 렌더링에 셰이더 활용 가능.

#### 매칭 큐: Redis vs 인메모리

| 기준 | Redis (선택) | 인메모리 (Map) |
|------|-------------|---------------|
| 서버 재시작 시 | 큐 유지 | 큐 소실 |
| 다중 서버 | 공유 가능 | 서버별 독립 |
| 복잡도 | 외부 의존성 추가 | 의존성 없음 |
| 이탈 카운터 | Redis TTL로 자연 만료 | 수동 정리 필요 |

**결정**: Redis(Upstash) 채택. 이탈 카운터, 매칭 큐, 세션 캐시를 단일 Redis로 통합하여 관리 포인트를 줄인다. Upstash Serverless Redis는 Railway와 잘 통합되고 무료 티어가 충분하다.

---

## 1. 프로젝트 구조

### 1.1 모노레포 루트 구조

```
yut-nori-game/
├── apps/
│   ├── mobile/                    # Expo + React Native 클라이언트
│   └── server/                    # Colyseus 게임 서버
├── packages/
│   └── shared/                    # 공유 게임 로직, 타입, 상수
├── package.json                   # 워크스페이스 루트
├── pnpm-workspace.yaml
├── tsconfig.base.json             # 공용 TypeScript 설정
├── .eslintrc.js
├── .prettierrc
└── turbo.json                     # Turborepo 빌드 파이프라인
```

### 1.2 클라이언트 디렉토리 구조 (apps/mobile)

```
apps/mobile/
├── app/                           # expo-router 파일 기반 라우팅
│   ├── _layout.tsx                # Root Layout (providers, global styles)
│   ├── index.tsx                  # 스플래시 → 자동 로그인 리디렉트
│   ├── (auth)/
│   │   ├── _layout.tsx            # Auth Stack Layout
│   │   ├── login.tsx              # 로그인 화면
│   │   └── profile-setup.tsx      # 닉네임/프로필 설정 (신규 가입 시)
│   ├── (main)/
│   │   ├── _layout.tsx            # Tab Layout (로비, 리더보드, 프로필, 설정)
│   │   ├── lobby.tsx              # 메인 로비
│   │   ├── leaderboard.tsx        # 리더보드
│   │   ├── profile.tsx            # 내 프로필/전적
│   │   └── settings.tsx           # 설정
│   ├── (game)/
│   │   ├── _layout.tsx            # Game Stack Layout (헤더 숨김)
│   │   ├── matching.tsx           # 매칭 대기 화면
│   │   ├── room/
│   │   │   ├── create.tsx         # 방 만들기
│   │   │   └── [code].tsx         # 방 참여 (코드 기반)
│   │   ├── play.tsx               # 게임 플레이 (메인 게임 화면)
│   │   ├── ai-setup.tsx           # AI 대전 설정 (난이도 선택)
│   │   └── result.tsx             # 게임 결과
│   └── (subscription)/
│       ├── _layout.tsx
│       └── store.tsx              # 구독/평생이용권 상점
├── src/
│   ├── components/
│   │   ├── ui/                    # 공통 UI 컴포넌트
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   └── BannerAd.tsx       # AdMob 배너 래퍼
│   │   ├── game/                  # 게임 전용 컴포넌트
│   │   │   ├── Board.tsx          # Skia 윷판 캔버스
│   │   │   ├── BoardNode.tsx      # 개별 칸 렌더링
│   │   │   ├── Mal.tsx            # 말 컴포넌트 (애니메이션 포함)
│   │   │   ├── MalStack.tsx       # 업힌 말 스택 표시
│   │   │   ├── YutThrow.tsx       # Rive 윷 던지기 뷰
│   │   │   ├── SkillGauge.tsx     # 스킬 게이지 바
│   │   │   ├── TurnIndicator.tsx  # 턴 표시 + 타이머
│   │   │   ├── PlayerPanel.tsx    # 플레이어 정보 패널
│   │   │   ├── MovePreview.tsx    # 이동 가능 경로 프리뷰
│   │   │   ├── CatchEffect.tsx    # 잡기 이펙트 (Lottie)
│   │   │   ├── ResultOverlay.tsx  # 승리/패배 오버레이
│   │   │   └── BubbleMessage.tsx  # 말풍선 메시지
│   │   ├── lobby/
│   │   │   ├── ModeSelector.tsx   # 1v1 / 2v2 / AI 선택
│   │   │   ├── GaugeModeToggle.tsx # 클래식/스킬 모드 토글
│   │   │   └── QuickMatchButton.tsx
│   │   ├── leaderboard/
│   │   │   ├── LeaderboardList.tsx
│   │   │   ├── LeaderboardRow.tsx
│   │   │   └── FriendLeaderboard.tsx
│   │   ├── character/
│   │   │   ├── CharacterGrid.tsx
│   │   │   ├── CharacterCard.tsx
│   │   │   └── CharacterPreview.tsx
│   │   └── auth/
│   │       ├── KakaoLoginButton.tsx
│   │       ├── GoogleLoginButton.tsx
│   │       └── AppleLoginButton.tsx
│   ├── stores/                    # Zustand stores
│   │   ├── authStore.ts
│   │   ├── gameStore.ts
│   │   ├── matchStore.ts
│   │   ├── settingsStore.ts
│   │   ├── leaderboardStore.ts
│   │   ├── characterStore.ts
│   │   └── subscriptionStore.ts
│   ├── services/                  # 외부 서비스 통합
│   │   ├── colyseus.ts            # Colyseus 클라이언트 싱글톤
│   │   ├── firebase.ts            # Firebase 초기화
│   │   ├── auth.ts                # 인증 서비스 (카카오/구글/Apple)
│   │   ├── admob.ts               # AdMob 설정
│   │   ├── purchases.ts           # RevenueCat 설정
│   │   ├── audio.ts               # 사운드 매니저
│   │   ├── haptics.ts             # 햅틱 피드백 래퍼
│   │   └── deeplink.ts            # 딥링크 핸들러
│   ├── hooks/
│   │   ├── useGame.ts             # 게임 상태 + 액션 훅
│   │   ├── useColyseus.ts         # Room 연결/재연결 훅
│   │   ├── useTimer.ts            # 턴 타이머 훅
│   │   ├── useAnimation.ts        # 애니메이션 큐 관리 훅
│   │   ├── useSubscription.ts     # 구독 상태 훅
│   │   └── useLocale.ts           # 현재 로케일 훅
│   ├── ai/                        # 오프라인 AI 엔진 (shared 로직 활용)
│   │   ├── AIGameEngine.ts        # 로컬 게임 루프
│   │   ├── AIPlayer.ts            # AI 의사결정
│   │   └── strategies/
│   │       ├── RandomStrategy.ts  # 쉬움
│   │       ├── HeuristicStrategy.ts # 보통
│   │       └── MinimaxStrategy.ts # 어려움
│   ├── i18n/
│   │   ├── index.ts               # i18next 초기화
│   │   ├── ko.json                # 한국어
│   │   ├── en.json                # 영어
│   │   └── ja.json                # 일본어
│   ├── constants/
│   │   ├── theme.ts               # Apple HIG 기반 디자인 토큰 (SF Pro Rounded, 색상, 간격)
│   │   ├── layout.ts              # 반응형 레이아웃 상수
│   │   └── ads.ts                 # 광고 단위 ID
│   ├── utils/
│   │   ├── format.ts              # 숫자/날짜 포맷
│   │   └── validation.ts          # 닉네임 검증 등
│   └── types/
│       └── navigation.ts          # 네비게이션 타입 (expo-router)
├── assets/
│   ├── images/                    # 정적 이미지
│   ├── animations/
│   │   ├── yut-throw.riv          # 윷 던지기 Rive
│   │   ├── catch-effect.json      # 잡기 Lottie
│   │   ├── victory.json           # 승리 Lottie
│   │   └── defeat.json            # 패배 Lottie
│   ├── sounds/
│   │   ├── yut-throw.mp3
│   │   ├── mal-move.mp3
│   │   ├── catch.mp3
│   │   ├── victory.mp3
│   │   ├── defeat.mp3
│   │   └── turn-notify.mp3
│   └── fonts/
│       ├── SF-Pro-Rounded-Regular.otf
│       ├── SF-Pro-Rounded-Medium.otf
│       ├── SF-Pro-Rounded-Semibold.otf
│       └── SF-Pro-Rounded-Bold.otf
├── app.json                       # Expo 설정
├── eas.json                       # EAS Build 설정
├── babel.config.js
├── metro.config.js                # 모노레포 metro 설정
├── tsconfig.json
└── package.json
```

### 1.3 서버 디렉토리 구조 (apps/server)

```
apps/server/
├── src/
│   ├── index.ts                   # Colyseus 서버 엔트리포인트
│   ├── config/
│   │   ├── index.ts               # 환경 변수 로딩
│   │   ├── firebase.ts            # Firebase Admin 초기화
│   │   └── redis.ts               # Redis (Upstash) 클라이언트
│   ├── rooms/
│   │   ├── YutGameRoom.ts         # 1v1/2v2 게임 룸
│   │   ├── commands/
│   │   │   ├── ThrowYutCommand.ts # 윷 던지기 커맨드
│   │   │   ├── MoveMalCommand.ts  # 말 이동 커맨드
│   │   │   ├── SelectPathCommand.ts # 지름길 선택 커맨드
│   │   │   └── SendBubbleCommand.ts # 말풍선 메시지 커맨드
│   │   └── schema/
│   │       ├── GameState.ts       # Room State 루트 스키마
│   │       ├── PlayerState.ts     # 플레이어 스키마
│   │       ├── MalState.ts        # 말 스키마
│   │       └── YutResultState.ts  # 윷 결과 스키마
│   ├── engine/
│   │   ├── YutEngine.ts           # 윷 결과 생성 (확률 + 게이지 보정)
│   │   ├── MoveValidator.ts       # 말 이동 검증
│   │   ├── TurnManager.ts         # 턴/타이머/추가 턴 관리
│   │   ├── WinChecker.ts          # 승리 조건 판정
│   │   └── GlickoRating.ts        # Glicko-2 레이팅 계산
│   ├── matchmaking/
│   │   ├── MatchmakingQueue.ts    # Redis 기반 매칭 큐
│   │   ├── RoomCodeManager.ts     # 방 코드 생성/관리
│   │   └── PenaltyChecker.ts      # 매칭 금지 체크
│   ├── services/
│   │   ├── UserService.ts         # Firestore 유저 CRUD
│   │   ├── GameRecordService.ts   # 게임 기록 저장
│   │   ├── LeaderboardService.ts  # 리더보드 업데이트
│   │   └── PenaltyService.ts      # 패널티 관리
│   ├── auth/
│   │   ├── tokenVerifier.ts       # Firebase ID Token 검증
│   │   └── kakaoAuth.ts           # 카카오 Custom Token 발급
│   └── utils/
│       ├── logger.ts              # 구조화된 로거
│       └── random.ts              # 시드 기반 랜덤
├── tsconfig.json
├── Dockerfile
└── package.json
```

### 1.4 Shared 패키지 (packages/shared)

```
packages/shared/
├── src/
│   ├── index.ts                   # 배럴 export
│   ├── board/
│   │   ├── BoardGraph.ts          # 윷판 그래프 구조 (노드/엣지)
│   │   ├── PathCalculator.ts      # 경로 계산 알고리즘
│   │   ├── BoardConstants.ts      # 칸 번호, 지름길 맵
│   │   └── BoardTypes.ts          # 보드 관련 타입
│   ├── game/
│   │   ├── GameRules.ts           # 게임 규칙 상수
│   │   ├── YutProbability.ts      # 윷 결과 확률 테이블
│   │   ├── WinCondition.ts        # 승리 조건 체크 (순수 함수)
│   │   ├── CatchLogic.ts          # 잡기 판정 (순수 함수)
│   │   ├── StackLogic.ts          # 업기 판정 (순수 함수)
│   │   └── BackdoLogic.ts         # 백도 처리 (순수 함수)
│   ├── types/
│   │   ├── game.ts                # 게임 관련 타입 전체
│   │   ├── player.ts              # 플레이어 타입
│   │   ├── messages.ts            # 클라이언트↔서버 메시지 타입
│   │   └── enums.ts               # 열거형 (YutResult, GamePhase 등)
│   └── constants/
│       ├── gameConfig.ts          # 게임 설정 상수
│       ├── characters.ts          # 캐릭터 정의
│       └── i18nKeys.ts            # 번역 키 상수
├── tsconfig.json
└── package.json
```

### 1.5 루트 package.json 의존성

```jsonc
// package.json (root)
{
  "name": "yut-nori-game",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.5.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0"
  }
}
```

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```jsonc
// apps/mobile/package.json 핵심 의존성
{
  "dependencies": {
    // Expo & React Native
    "expo": "~52.0.0",
    "react-native": "0.76.x",
    "expo-router": "~4.0.0",
    "expo-dev-client": "~5.0.0",

    // 렌더링 & 애니메이션
    "@shopify/react-native-skia": "^1.5.0",
    "rive-react-native": "^8.0.0",
    "lottie-react-native": "^7.0.0",
    "react-native-reanimated": "~3.16.0",

    // 상태 관리
    "zustand": "^5.0.0",

    // 네트워킹
    "colyseus.js": "^0.16.0",

    // Firebase
    "@react-native-firebase/app": "^21.0.0",
    "@react-native-firebase/auth": "^21.0.0",
    "@react-native-firebase/firestore": "^21.0.0",

    // 인증
    "@react-native-seoul/kakao-login": "^5.4.0",
    "@react-native-google-signin/google-signin": "^13.0.0",
    "@invertase/react-native-apple-authentication": "^2.4.0",

    // 수익화
    "react-native-purchases": "^8.0.0",
    "react-native-google-mobile-ads": "^14.0.0",

    // 유틸리티
    "expo-haptics": "~14.0.0",
    "expo-audio": "~0.3.0",
    "expo-sharing": "~13.0.0",
    "expo-notifications": "~0.29.0",
    "expo-localization": "~16.0.0",
    "expo-linking": "~7.0.0",
    "i18next": "^24.0.0",
    "react-i18next": "^15.0.0",
    "@react-native-community/netinfo": "^11.0.0",

    // 공유 패키지
    "@yut/shared": "workspace:*"
  }
}
```

```jsonc
// apps/server/package.json 핵심 의존성
{
  "dependencies": {
    "colyseus": "^0.16.0",
    "@colyseus/monitor": "^0.16.0",
    "@colyseus/playground": "^0.16.0",
    "express": "^4.21.0",
    "firebase-admin": "^13.0.0",
    "ioredis": "^5.4.0",
    "glicko2": "^1.2.0",
    "uuid": "^10.0.0",
    "dotenv": "^16.4.0",

    // 공유 패키지
    "@yut/shared": "workspace:*"
  },
  "devDependencies": {
    "@colyseus/testing": "^0.16.0",
    "ts-node": "^10.9.0",
    "nodemon": "^3.1.0",
    "jest": "^29.7.0",
    "@types/express": "^5.0.0"
  }
}
```

```jsonc
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

---

## 2. 화면 구성 & 네비게이션

### 2.1 전체 화면 목록

| 화면 | 경로 | 설명 | 진입 조건 |
|------|------|------|----------|
| 스플래시 | `/` (index) | 앱 로딩 + 자동 로그인 시도 | 앱 시작 |
| 로그인 | `/(auth)/login` | 카카오/구글/Apple 로그인 | 미인증 상태 |
| 프로필 설정 | `/(auth)/profile-setup` | 닉네임/프로필 설정 | 신규 가입 |
| 로비 | `/(main)/lobby` | 게임 모드 선택, 빠른 매칭 | 인증 완료 |
| 리더보드 | `/(main)/leaderboard` | 글로벌/친구 승수 랭킹 | 인증 완료 |
| 프로필 | `/(main)/profile` | 내 전적, 캐릭터 장착 | 인증 완료 |
| 설정 | `/(main)/settings` | 사운드, 언어, 계정, 구독 관리 | 인증 완료 |
| 매칭 대기 | `/(game)/matching` | 매칭 중 대기 화면 | 빠른 매칭 요청 |
| 방 만들기 | `/(game)/room/create` | 방 설정 + 코드 생성 | 방 만들기 선택 |
| 방 참여 | `/(game)/room/[code]` | 코드로 방 참여 + 대기 | 코드 입력 또는 딥링크 |
| AI 설정 | `/(game)/ai-setup` | AI 난이도 + 게이지 모드 선택 | AI 대전 선택 |
| 게임 플레이 | `/(game)/play` | 메인 게임 화면 | 매칭 완료 또는 방 시작 |
| 게임 결과 | `/(game)/result` | 승패, 전적 변동, 보상 | 게임 종료 |
| 구독 상점 | `/(subscription)/store` | 구독/평생이용권 구매 | 상점 진입 |

### 2.2 네비게이션 플로우

```
앱 시작
  │
  ▼
[스플래시 / index]
  │
  ├─ 토큰 유효 ──────────────────────────────────────┐
  │                                                   │
  ├─ 토큰 없음/만료 → [(auth)/login]                  │
  │                      │                            │
  │                      ├─ 신규 → [(auth)/profile-setup] → ─┐
  │                      │                                    │
  │                      └─ 기존 → ───────────────────────────┤
  │                                                           │
  ▼ ◄─────────────────────────────────────────────────────────┘
[(main) Tab Navigator]
  │
  ├─ Tab 1: [lobby]
  │   ├─ 빠른 매칭 → [(game)/matching] → [(game)/play] → [(game)/result] → [lobby]
  │   ├─ 방 만들기 → [(game)/room/create] → 대기 → [(game)/play] → ...
  │   ├─ 방 참여 → [(game)/room/[code]] → 대기 → [(game)/play] → ...
  │   └─ AI 대전 → [(game)/ai-setup] → [(game)/play] → [(game)/result] → [lobby]
  │
  ├─ Tab 2: [leaderboard]
  │   ├─ 글로벌 탭
  │   └─ 친구 탭
  │
  ├─ Tab 3: [profile]
  │   ├─ 전적 표시
  │   ├─ 캐릭터 선택 → CharacterGrid
  │   └─ 구독 배너 → [(subscription)/store]
  │
  └─ Tab 4: [settings]
      ├─ 사운드 설정
      ├─ 언어 변경
      ├─ 구독 관리 → [(subscription)/store]
      └─ 로그아웃 → [(auth)/login]
```

### 2.3 expo-router 파일 구조

```typescript
// app/_layout.tsx — Root Layout
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nextProvider } from 'react-i18next';
import { BannerAdWrapper } from '@/components/ui/BannerAd';
import i18n from '@/i18n';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nextProvider i18n={i18n}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(main)" />
            <Stack.Screen name="(game)" />
            <Stack.Screen name="(subscription)" />
          </Stack>
          <BannerAdWrapper />
        </I18nextProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

```typescript
// app/(main)/_layout.tsx — Tab Navigator
import { Tabs } from 'expo-router';

export default function MainLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="lobby"
        options={{ title: 'lobby', tabBarIcon: /* ... */ }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{ title: 'leaderboard', tabBarIcon: /* ... */ }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'profile', tabBarIcon: /* ... */ }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'settings', tabBarIcon: /* ... */ }}
      />
    </Tabs>
  );
}
```

### 2.4 각 화면별 주요 UI 컴포넌트

#### 로비 화면 (lobby.tsx)
```
┌─────────────────────────┐
│  [프로필 아바타] 닉네임   │  ← 상단 프로필 바
│  승수: 42 | 승률: 65%    │
├─────────────────────────┤
│                         │
│  ┌───────┐ ┌───────┐   │
│  │  1v1  │ │  2v2  │   │  ← ModeSelector
│  └───────┘ └───────┘   │
│       ┌───────┐         │
│       │  AI   │         │
│       └───────┘         │
│                         │
│  [클래식 ○ / ● 스킬]    │  ← GaugeModeToggle
│                         │
│  ┌─────────────────┐    │
│  │   빠른 매칭 ▶   │    │  ← QuickMatchButton
│  └─────────────────┘    │
│                         │
│  [방 만들기] [방 참여]   │  ← 하단 보조 버튼
│                         │
├─────────────────────────┤
│  [AdMob 배너 광고]       │  ← BannerAdWrapper (구독 시 숨김)
└─────────────────────────┘
```

#### 게임 플레이 화면 (play.tsx)
```
┌──────────────────────────────┐
│  P1 정보  [턴 타이머]  P2 정보│  ← PlayerPanel x2 + TurnIndicator
├──────────────────────────────┤
│                              │
│        ┌──────────┐          │
│        │          │          │
│        │  윷  판  │          │  ← Board (Skia Canvas)
│        │          │          │
│        │          │          │
│        └──────────┘          │
│                              │
│   [말1] [말2] [말3] [말4]    │  ← 내 말 상태 표시
│                              │
├──────────────────────────────┤
│  ┌────────────────────┐      │
│  │   [스킬 게이지 바]  │      │  ← SkillGauge (스킬 모드 시)
│  └────────────────────┘      │
│  ┌────────────────────┐      │
│  │     던지기 버튼      │      │  ← YutThrow 트리거
│  └────────────────────┘      │
│                              │
│  [😅] [👏] [⏰] [👋]        │  ← BubbleMessage 프리셋 4종
├──────────────────────────────┤
│  [AdMob 배너 광고]            │  ← 게임 중에도 하단 고정
└──────────────────────────────┘
```

#### 게임 결과 화면 (result.tsx)
```
┌──────────────────────────────┐
│                              │
│      🎉 승리! / 😢 패배     │  ← ResultOverlay (Lottie)
│                              │
│  ┌────────────────────────┐  │
│  │  승수 변동: 42 → 43    │  │
│  │  승률: 65% → 66%       │  │
│  │  연승: 3               │  │
│  └────────────────────────┘  │
│                              │
│  ┌──────────┐ ┌──────────┐  │
│  │  다시하기  │ │  로비로   │  │
│  └──────────┘ └──────────┘  │
│                              │
├──────────────────────────────┤
│  [AdMob 배너 광고]            │
└──────────────────────────────┘
```

---

## 3. 상태 관리 설계 (Zustand)

### 3.1 Store 아키텍처 원칙

- **서버 상태**: Colyseus Room State에서 onStateChange로 수신 → GameStore에 미러링. 클라이언트가 직접 변이하지 않음.
- **클라이언트 상태**: UI 상태(모달 열림, 선택된 탭 등), 설정(사운드, 언어), 인증 토큰 등은 클라이언트 전용 Store에서 관리.
- **영속 상태**: AsyncStorage를 통한 persist 미들웨어로 설정/인증 토큰을 디바이스에 저장.

### 3.2 AuthStore

```typescript
// src/stores/authStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UserProfile {
  uid: string;
  nickname: string;
  profileImage: string;
  provider: 'kakao' | 'google' | 'apple';
  stats: {
    totalGames: number;
    wins: number;
    losses: number;
    winStreak: number;
    maxWinStreak: number;
    monthlyWins: number;
  };
  subscription: {
    type: 'none' | 'weekly' | 'monthly' | 'lifetime';
    expiresAt: number | null;
  };
  equippedCharacter: string;
  unlockedCharacters: string[];
}

interface AuthState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  firebaseToken: string | null;

  // Actions
  setUser: (user: UserProfile) => void;
  setFirebaseToken: (token: string) => void;
  updateStats: (stats: Partial<UserProfile['stats']>) => void;
  updateSubscription: (sub: UserProfile['subscription']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      firebaseToken: null,

      setUser: (user) => set({ user, isAuthenticated: true, isLoading: false }),
      setFirebaseToken: (token) => set({ firebaseToken: token }),
      updateStats: (stats) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, stats: { ...state.user.stats, ...stats } }
            : null,
        })),
      updateSubscription: (sub) =>
        set((state) => ({
          user: state.user ? { ...state.user, subscription: sub } : null,
        })),
      logout: () =>
        set({
          isAuthenticated: false,
          user: null,
          firebaseToken: null,
          isLoading: false,
        }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        firebaseToken: state.firebaseToken,
        user: state.user,
      }),
    }
  )
);
```

### 3.3 GameStore

```typescript
// src/stores/gameStore.ts
import { create } from 'zustand';
import type {
  YutResult,
  GamePhase,
  GaugeMode,
  MalPosition,
  GaugeZone,
} from '@yut/shared';

interface PlayerInfo {
  userId: string;
  nickname: string;
  team: number;
  characterId: string;
  mals: MalInfo[];
  isConnected: boolean;
}

interface MalInfo {
  index: number;
  position: MalPosition; // -1: 대기, 0~29: 보드 위, 30: 골인
  isStacked: boolean;
  stackedWith: number[];
  isOnShortcut: boolean; // 지름길 경로에 있는지
}

interface GameState {
  // -- 서버 동기화 상태 (onStateChange로 업데이트) --
  roomId: string | null;
  phase: GamePhase; // 'waiting' | 'playing' | 'finished'
  mode: '1v1' | '2v2';
  gaugeMode: GaugeMode; // 'classic' | 'skill'
  currentTurnPlayerIndex: number;
  turnTimer: number;
  extraTurns: number;
  players: PlayerInfo[];
  lastYutResult: YutResult | null;
  lastGaugeZone: GaugeZone | null;

  // -- 클라이언트 전용 상태 --
  myPlayerIndex: number;
  isMyTurn: boolean;
  selectedMalIndex: number | null;
  availableMoves: { malIndex: number; targetPosition: number; path: number[] }[];
  showPathChoice: boolean; // 지름길 분기 선택 UI
  pathChoiceOptions: { shortcut: number[]; normal: number[] } | null;
  animationQueue: AnimationEvent[];
  isAnimating: boolean;

  // -- Actions (서버 상태 동기화) --
  syncFromServer: (serverState: any) => void;
  setRoomId: (roomId: string) => void;
  setMyPlayerIndex: (index: number) => void;

  // -- Actions (클라이언트 UI) --
  selectMal: (malIndex: number | null) => void;
  setAvailableMoves: (moves: GameState['availableMoves']) => void;
  showPathChoiceUI: (options: GameState['pathChoiceOptions']) => void;
  hidePathChoiceUI: () => void;
  enqueueAnimation: (event: AnimationEvent) => void;
  dequeueAnimation: () => void;
  setAnimating: (value: boolean) => void;

  // -- Reset --
  resetGame: () => void;
}

type AnimationEvent =
  | { type: 'yut_throw'; result: YutResult; gaugeZone?: GaugeZone }
  | { type: 'mal_move'; malIndex: number; path: number[]; playerIndex: number }
  | { type: 'mal_catch'; catcherMalIndex: number; caughtMalIndex: number; caughtPlayerIndex: number }
  | { type: 'mal_stack'; malIndex: number; stackTargetIndex: number }
  | { type: 'mal_goal'; malIndex: number; playerIndex: number }
  | { type: 'game_over'; winnerTeam: number };

export const useGameStore = create<GameState>()((set, get) => ({
  roomId: null,
  phase: 'waiting',
  mode: '1v1',
  gaugeMode: 'classic',
  currentTurnPlayerIndex: 0,
  turnTimer: 30,
  extraTurns: 0,
  players: [],
  lastYutResult: null,
  lastGaugeZone: null,

  myPlayerIndex: -1,
  isMyTurn: false,
  selectedMalIndex: null,
  availableMoves: [],
  showPathChoice: false,
  pathChoiceOptions: null,
  animationQueue: [],
  isAnimating: false,

  syncFromServer: (serverState) => {
    const myIndex = get().myPlayerIndex;
    set({
      phase: serverState.phase,
      currentTurnPlayerIndex: serverState.currentTurn,
      turnTimer: serverState.turnTimer,
      extraTurns: serverState.extraTurns,
      players: serverState.players.map((p: any) => ({
        userId: p.userId,
        nickname: p.nickname,
        team: p.team,
        characterId: p.characterId,
        mals: p.mals.map((m: any, i: number) => ({
          index: i,
          position: m.position,
          isStacked: m.isStacked,
          stackedWith: Array.from(m.stackedWith),
          isOnShortcut: m.isOnShortcut,
        })),
        isConnected: p.isConnected,
      })),
      lastYutResult: serverState.yutResult,
      lastGaugeZone: serverState.gaugeZone,
      isMyTurn: serverState.currentTurn === myIndex,
    });
  },

  setRoomId: (roomId) => set({ roomId }),
  setMyPlayerIndex: (index) => set({ myPlayerIndex: index }),

  selectMal: (malIndex) => set({ selectedMalIndex: malIndex }),
  setAvailableMoves: (moves) => set({ availableMoves: moves }),
  showPathChoiceUI: (options) =>
    set({ showPathChoice: true, pathChoiceOptions: options }),
  hidePathChoiceUI: () =>
    set({ showPathChoice: false, pathChoiceOptions: null }),

  enqueueAnimation: (event) =>
    set((state) => ({
      animationQueue: [...state.animationQueue, event],
    })),
  dequeueAnimation: () =>
    set((state) => ({
      animationQueue: state.animationQueue.slice(1),
    })),
  setAnimating: (value) => set({ isAnimating: value }),

  resetGame: () =>
    set({
      roomId: null,
      phase: 'waiting',
      currentTurnPlayerIndex: 0,
      turnTimer: 30,
      extraTurns: 0,
      players: [],
      lastYutResult: null,
      lastGaugeZone: null,
      myPlayerIndex: -1,
      isMyTurn: false,
      selectedMalIndex: null,
      availableMoves: [],
      showPathChoice: false,
      pathChoiceOptions: null,
      animationQueue: [],
      isAnimating: false,
    }),
}));
```

### 3.4 MatchStore

```typescript
// src/stores/matchStore.ts
import { create } from 'zustand';
import type { GaugeMode } from '@yut/shared';

type MatchStatus = 'idle' | 'queued' | 'found' | 'connecting' | 'error';
type GameMode = '1v1' | '2v2';

interface MatchState {
  status: MatchStatus;
  gameMode: GameMode;
  gaugeMode: GaugeMode;
  elapsedSeconds: number;
  error: string | null;

  // 방 만들기
  roomCode: string | null;
  isRoomHost: boolean;
  roomPlayers: { nickname: string; isReady: boolean }[];

  // Actions
  setGameMode: (mode: GameMode) => void;
  setGaugeMode: (mode: GaugeMode) => void;
  startMatching: () => void;
  cancelMatching: () => void;
  setMatchFound: () => void;
  setConnecting: () => void;
  setError: (error: string) => void;
  tickElapsed: () => void;

  // 방 관련
  setRoomCode: (code: string) => void;
  setIsRoomHost: (value: boolean) => void;
  setRoomPlayers: (players: MatchState['roomPlayers']) => void;

  reset: () => void;
}

export const useMatchStore = create<MatchState>()((set) => ({
  status: 'idle',
  gameMode: '1v1',
  gaugeMode: 'classic',
  elapsedSeconds: 0,
  error: null,
  roomCode: null,
  isRoomHost: false,
  roomPlayers: [],

  setGameMode: (mode) => set({ gameMode: mode }),
  setGaugeMode: (mode) => set({ gaugeMode: mode }),
  startMatching: () => set({ status: 'queued', elapsedSeconds: 0, error: null }),
  cancelMatching: () => set({ status: 'idle', elapsedSeconds: 0 }),
  setMatchFound: () => set({ status: 'found' }),
  setConnecting: () => set({ status: 'connecting' }),
  setError: (error) => set({ status: 'error', error }),
  tickElapsed: () => set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 })),

  setRoomCode: (code) => set({ roomCode: code }),
  setIsRoomHost: (value) => set({ isRoomHost: value }),
  setRoomPlayers: (players) => set({ roomPlayers: players }),

  reset: () =>
    set({
      status: 'idle',
      elapsedSeconds: 0,
      error: null,
      roomCode: null,
      isRoomHost: false,
      roomPlayers: [],
    }),
}));
```

### 3.5 SettingsStore

```typescript
// src/stores/settingsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Language = 'ko' | 'en' | 'ja';

interface SettingsState {
  bgmVolume: number; // 0.0 ~ 1.0
  sfxVolume: number; // 0.0 ~ 1.0
  isMuted: boolean;
  language: Language;
  hapticEnabled: boolean;
  notifications: {
    matchFound: boolean;
    friendInvite: boolean;
  };

  setBgmVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  toggleMute: () => void;
  setLanguage: (lang: Language) => void;
  toggleHaptic: () => void;
  setNotification: (key: keyof SettingsState['notifications'], value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      bgmVolume: 0.7,
      sfxVolume: 1.0,
      isMuted: false,
      language: 'ko',
      hapticEnabled: true,
      notifications: {
        matchFound: true,
        friendInvite: true,
      },

      setBgmVolume: (v) => set({ bgmVolume: v }),
      setSfxVolume: (v) => set({ sfxVolume: v }),
      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
      setLanguage: (lang) => set({ language: lang }),
      toggleHaptic: () => set((s) => ({ hapticEnabled: !s.hapticEnabled })),
      setNotification: (key, value) =>
        set((s) => ({
          notifications: { ...s.notifications, [key]: value },
        })),
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

### 3.6 LeaderboardStore

```typescript
// src/stores/leaderboardStore.ts
import { create } from 'zustand';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  nickname: string;
  profileImage: string;
  characterId: string;
  monthlyWins: number;
  winRate: number;
}

type LeaderboardTab = 'global' | 'friends';

interface LeaderboardState {
  activeTab: LeaderboardTab;
  globalEntries: LeaderboardEntry[];
  friendEntries: LeaderboardEntry[];
  myGlobalRank: number | null;
  myFriendRank: number | null;
  isLoading: boolean;
  lastFetched: number | null;

  setActiveTab: (tab: LeaderboardTab) => void;
  setGlobalEntries: (entries: LeaderboardEntry[], myRank: number | null) => void;
  setFriendEntries: (entries: LeaderboardEntry[], myRank: number | null) => void;
  setLoading: (value: boolean) => void;
}

export const useLeaderboardStore = create<LeaderboardState>()((set) => ({
  activeTab: 'global',
  globalEntries: [],
  friendEntries: [],
  myGlobalRank: null,
  myFriendRank: null,
  isLoading: false,
  lastFetched: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setGlobalEntries: (entries, myRank) =>
    set({ globalEntries: entries, myGlobalRank: myRank, lastFetched: Date.now() }),
  setFriendEntries: (entries, myRank) =>
    set({ friendEntries: entries, myFriendRank: myRank }),
  setLoading: (value) => set({ isLoading: value }),
}));
```

### 3.7 CharacterStore

```typescript
// src/stores/characterStore.ts
import { create } from 'zustand';

interface CharacterDef {
  id: string;
  name: string;        // i18n 키
  tier: 'free' | 'subscriber';
  thumbnailUri: string;
  previewUri: string;
}

interface CharacterState {
  allCharacters: CharacterDef[];
  unlockedIds: string[];
  equippedId: string;

  setAllCharacters: (chars: CharacterDef[]) => void;
  setUnlockedIds: (ids: string[]) => void;
  equipCharacter: (id: string) => void;
  isUnlocked: (id: string) => boolean;
}

export const useCharacterStore = create<CharacterState>()((set, get) => ({
  allCharacters: [],
  unlockedIds: [],
  equippedId: 'stone', // 기본 캐릭터

  setAllCharacters: (chars) => set({ allCharacters: chars }),
  setUnlockedIds: (ids) => set({ unlockedIds: ids }),
  equipCharacter: (id) => set({ equippedId: id }),
  isUnlocked: (id) => get().unlockedIds.includes(id),
}));
```

### 3.8 SubscriptionStore

```typescript
// src/stores/subscriptionStore.ts
import { create } from 'zustand';

type SubscriptionType = 'none' | 'weekly' | 'monthly' | 'lifetime';

interface SubscriptionState {
  type: SubscriptionType;
  expiresAt: number | null;
  isActive: boolean; // computed: type !== 'none' && (lifetime || expiresAt > now)
  isLoading: boolean;

  setSubscription: (type: SubscriptionType, expiresAt: number | null) => void;
  setLoading: (value: boolean) => void;
  checkIsActive: () => boolean;
}

export const useSubscriptionStore = create<SubscriptionState>()((set, get) => ({
  type: 'none',
  expiresAt: null,
  isActive: false,
  isLoading: false,

  setSubscription: (type, expiresAt) => {
    const isActive =
      type === 'lifetime' || (type !== 'none' && expiresAt !== null && expiresAt > Date.now());
    set({ type, expiresAt, isActive });
  },
  setLoading: (value) => set({ isLoading: value }),
  checkIsActive: () => {
    const { type, expiresAt } = get();
    return type === 'lifetime' || (type !== 'none' && expiresAt !== null && expiresAt > Date.now());
  },
}));
```

---

## 4. Colyseus 서버 설계

### 4.1 서버 엔트리포인트

```typescript
// apps/server/src/index.ts
import { Server } from 'colyseus';
import { createServer } from 'http';
import express from 'express';
import { monitor } from '@colyseus/monitor';
import { YutGameRoom } from './rooms/YutGameRoom';
import { initFirebase } from './config/firebase';
import { initRedis } from './config/redis';

const app = express();
const httpServer = createServer(app);

async function bootstrap() {
  await initFirebase();
  await initRedis();

  const gameServer = new Server({
    server: httpServer,
    // Colyseus v0.16+ driver 설정
  });

  // Room 등록
  gameServer.define('yut_game', YutGameRoom);

  // 모니터링 (개발/스테이징 전용)
  if (process.env.NODE_ENV !== 'production') {
    app.use('/colyseus', monitor());
  }

  // 카카오 커스텀 토큰 발급 엔드포인트
  app.post('/auth/kakao', /* kakaoAuth handler */);

  // 헬스 체크
  app.get('/health', (_, res) => res.json({ status: 'ok' }));

  const port = Number(process.env.PORT) || 2567;
  httpServer.listen(port, () => {
    console.log(`Colyseus server listening on port ${port}`);
  });
}

bootstrap();
```

### 4.2 Room State Schema

```typescript
// apps/server/src/rooms/schema/MalState.ts
import { Schema, type, ArraySchema } from '@colyseus/schema';

export class MalState extends Schema {
  @type('int8') position: number = -1;       // -1: 대기, 0~29: 보드 위, 30: 골인
  @type('boolean') isStacked: boolean = false;
  @type(['int8']) stackedWith = new ArraySchema<number>();
  @type('boolean') isOnShortcut: boolean = false;
}
```

```typescript
// apps/server/src/rooms/schema/PlayerState.ts
import { Schema, type, ArraySchema } from '@colyseus/schema';
import { MalState } from './MalState';

export class PlayerState extends Schema {
  @type('string') userId: string = '';
  @type('string') nickname: string = '';
  @type('int8') team: number = 0;           // 0 또는 1
  @type('int8') playerIndex: number = 0;     // 0~3 (2v2 시 0,1 vs 2,3)
  @type('string') characterId: string = 'stone';
  @type('number') rating: number = 1500;
  @type([MalState]) mals = new ArraySchema<MalState>();
  @type('boolean') isConnected: boolean = true;
  @type('int8') consecutiveTimeouts: number = 0; // 연속 시간 초과
}
```

```typescript
// apps/server/src/rooms/schema/YutResultState.ts
import { Schema, type } from '@colyseus/schema';

export class YutResultState extends Schema {
  @type('string') result: string = '';       // 'do' | 'gae' | 'geol' | 'yut' | 'mo' | 'backdo'
  @type('string') gaugeZone: string = '';    // 'perfect' | 'good' | 'normal' | 'bad'
  @type('int8') moveAmount: number = 0;      // 이동 칸수 (backdo: -1)
  @type('boolean') grantsExtraTurn: boolean = false;
}
```

```typescript
// apps/server/src/rooms/schema/GameState.ts
import { Schema, type, ArraySchema, MapSchema } from '@colyseus/schema';
import { PlayerState } from './PlayerState';
import { YutResultState } from './YutResultState';

export type GamePhaseType = 'waiting' | 'playing' | 'finished';
export type TurnPhaseType = 'throw' | 'move' | 'path_choice' | 'animating';

export class GameState extends Schema {
  // 게임 진행 상태
  @type('string') phase: GamePhaseType = 'waiting';
  @type('string') turnPhase: TurnPhaseType = 'throw';
  @type('string') mode: string = '1v1';       // '1v1' | '2v2'
  @type('string') gaugeMode: string = 'classic'; // 'classic' | 'skill'

  // 턴 관리
  @type('int8') currentTurn: number = 0;       // 현재 턴의 playerIndex
  @type('number') turnTimer: number = 30;      // 남은 시간(초)
  @type('int8') extraTurns: number = 0;        // 남은 추가 턴

  // 윷 결과
  @type(YutResultState) lastYutResult = new YutResultState();

  // 턴 순서 (2v2: [0, 2, 1, 3] — 1팀A, 2팀A, 1팀B, 2팀B)
  @type(['int8']) turnOrder = new ArraySchema<number>();

  // 플레이어
  @type([PlayerState]) players = new ArraySchema<PlayerState>();

  // 방 설정
  @type('string') roomCode: string = '';
  @type('int8') turnTimeLimit: number = 30;    // 15 | 30 | 60
  @type('boolean') isRanked: boolean = true;

  // 게임 결과
  @type('int8') winnerTeam: number = -1;
  @type('string') winReason: string = '';      // 'complete' | 'surrender' | 'disconnect' | 'timeout'
}
```

### 4.3 YutGameRoom 클래스

```typescript
// apps/server/src/rooms/YutGameRoom.ts
import { Room, Client, Delayed } from 'colyseus';
import { GameState } from './schema/GameState';
import { PlayerState } from './schema/PlayerState';
import { MalState } from './schema/MalState';
import { YutEngine } from '../engine/YutEngine';
import { MoveValidator } from '../engine/MoveValidator';
import { TurnManager } from '../engine/TurnManager';
import { WinChecker } from '../engine/WinChecker';
import { GlickoRating } from '../engine/GlickoRating';
import { UserService } from '../services/UserService';
import { GameRecordService } from '../services/GameRecordService';
import { LeaderboardService } from '../services/LeaderboardService';
import { PenaltyChecker } from '../matchmaking/PenaltyChecker';
import { verifyFirebaseToken } from '../auth/tokenVerifier';
import type {
  ThrowYutMessage,
  MoveMalMessage,
  SelectPathMessage,
  SendBubbleMessage,
} from '@yut/shared';

export class YutGameRoom extends Room<GameState> {
  private yutEngine = new YutEngine();
  private moveValidator = new MoveValidator();
  private turnManager!: TurnManager;
  private winChecker = new WinChecker();
  private userService = new UserService();
  private gameRecordService = new GameRecordService();
  private leaderboardService = new LeaderboardService();
  private penaltyChecker = new PenaltyChecker();
  private turnTimer: Delayed | null = null;
  private turnLog: any[] = [];

  // Room 생성 시 호출
  onCreate(options: {
    mode: '1v1' | '2v2';
    gaugeMode: 'classic' | 'skill';
    turnTimeLimit?: number;
    roomCode?: string;
    isRanked?: boolean;
  }) {
    this.setState(new GameState());
    this.state.mode = options.mode;
    this.state.gaugeMode = options.gaugeMode;
    this.state.turnTimeLimit = options.turnTimeLimit ?? 30;
    this.state.roomCode = options.roomCode ?? '';
    this.state.isRanked = options.isRanked ?? true;

    this.turnManager = new TurnManager(this.state, this.clock);

    const maxClients = options.mode === '1v1' ? 2 : 4;
    this.maxClients = maxClients;

    // 메시지 핸들러 등록
    this.onMessage('throw_yut', this.handleThrowYut.bind(this));
    this.onMessage('move_mal', this.handleMoveMal.bind(this));
    this.onMessage('select_path', this.handleSelectPath.bind(this));
    this.onMessage('send_bubble', this.handleSendBubble.bind(this));
    this.onMessage('surrender', this.handleSurrender.bind(this));

    // 재접속 허용
    this.autoDispose = false;
  }

  // 클라이언트 인증 + 참가
  async onAuth(client: Client, options: { token: string }) {
    const decoded = await verifyFirebaseToken(options.token);
    const isBanned = await this.penaltyChecker.isMatchBanned(decoded.uid);
    if (isBanned) throw new Error('MATCH_BANNED');
    return decoded; // { uid, ... }
  }

  onJoin(client: Client, options: any, auth: { uid: string }) {
    const playerIndex = this.state.players.length;
    const team = this.state.mode === '1v1'
      ? playerIndex // 1v1: 각자 팀
      : Math.floor(playerIndex / 2); // 2v2: 0,1 → 팀0 / 2,3 → 팀1

    const player = new PlayerState();
    player.userId = auth.uid;
    player.playerIndex = playerIndex;
    player.team = team;

    // 말 초기화
    const malCount = this.state.mode === '1v1' ? 4 : 2;
    for (let i = 0; i < malCount; i++) {
      player.mals.push(new MalState());
    }

    this.state.players.push(player);

    // 유저 정보 비동기 로딩 (닉네임, 레이팅, 캐릭터)
    this.loadPlayerProfile(player, auth.uid);

    // 정원 찼으면 게임 시작
    if (this.state.players.length === this.maxClients) {
      this.startGame();
    }
  }

  private async loadPlayerProfile(player: PlayerState, uid: string) {
    const profile = await this.userService.getUser(uid);
    if (profile) {
      player.nickname = profile.nickname;
      player.rating = profile.rating;
      player.characterId = profile.characters.equipped;
    }
  }

  private startGame() {
    this.state.phase = 'playing';

    // 턴 순서 결정
    if (this.state.mode === '1v1') {
      // 랜덤 선공
      const first = Math.random() < 0.5 ? 0 : 1;
      this.state.turnOrder.push(first, 1 - first);
    } else {
      // 2v2: 1팀A → 2팀A → 1팀B → 2팀B (교차)
      this.state.turnOrder.push(0, 2, 1, 3);
    }

    this.state.currentTurn = this.state.turnOrder[0];
    this.state.turnPhase = 'throw';
    this.startTurnTimer();

    this.lock(); // 추가 참가 차단
  }

  // --- 메시지 핸들러 ---

  private handleThrowYut(client: Client, message: ThrowYutMessage) {
    const playerIndex = this.getPlayerIndex(client);
    if (playerIndex !== this.state.currentTurn) return;
    if (this.state.turnPhase !== 'throw') return;

    // 게이지 결과 검증 (스킬 모드)
    let gaugeZone: GaugeZone = 'normal';
    if (this.state.gaugeMode === 'skill') {
      // 서버 타이밍 기반 게이지 검증 — 클라이언트 값을 신뢰하지 않음
      const elapsed = Date.now() - this.state.turnStartedAt;
      const gaugeCycleDuration = 1750; // 게이지 왕복 주기 (ms)
      const gaugePosition = (elapsed % gaugeCycleDuration) / gaugeCycleDuration;
      const serverGaugeZone = this.calculateGaugeZone(gaugePosition);
      // 클라이언트 값과 1단계 이내 차이만 허용 (네트워크 지연 보정)
      gaugeZone = this.validateGaugeZone(message.gaugeZone ?? 'normal', serverGaugeZone);
    }

    // 서버에서 윷 결과 생성
    const result = this.yutEngine.generateResult(gaugeZone);

    // 상태 업데이트
    this.state.lastYutResult.result = result.type;
    this.state.lastYutResult.gaugeZone = gaugeZone;
    this.state.lastYutResult.moveAmount = result.moveAmount;
    this.state.lastYutResult.grantsExtraTurn = result.grantsExtraTurn;

    if (result.grantsExtraTurn) {
      this.state.extraTurns++;
    }

    this.state.turnPhase = 'move';
    this.resetTurnTimer(); // 말 선택 타이머 시작
  }

  private handleMoveMal(client: Client, message: MoveMalMessage) {
    const playerIndex = this.getPlayerIndex(client);
    if (playerIndex !== this.state.currentTurn) return;
    if (this.state.turnPhase !== 'move') return;

    const player = this.state.players[playerIndex];
    const mal = player.mals[message.malIndex];
    if (!mal) return;

    const moveAmount = this.state.lastYutResult.moveAmount;

    // 이동 검증
    const validation = this.moveValidator.validate(
      mal,
      moveAmount,
      this.state.players,
      playerIndex
    );

    if (!validation.isValid) return;

    // 지름길 분기 필요한 경우
    if (validation.requiresPathChoice) {
      this.state.turnPhase = 'path_choice';
      // 클라이언트에서 select_path 메시지 대기
      return;
    }

    this.executeMalMove(playerIndex, message.malIndex, validation.targetPosition, validation.path);
  }

  private handleSelectPath(client: Client, message: SelectPathMessage) {
    const playerIndex = this.getPlayerIndex(client);
    if (playerIndex !== this.state.currentTurn) return;
    if (this.state.turnPhase !== 'path_choice') return;

    const useShortcut = message.useShortcut;
    // path_choice 시 저장해둔 양쪽 경로 중 선택 실행
    // ...executeMalMove 호출
  }

  private executeMalMove(
    playerIndex: number,
    malIndex: number,
    targetPosition: number,
    path: number[]
  ) {
    const player = this.state.players[playerIndex];
    const mal = player.mals[malIndex];

    const previousPosition = mal.position;
    mal.position = targetPosition;

    // 잡기 판정
    const catchResult = this.checkCatch(playerIndex, targetPosition);
    if (catchResult.caught) {
      this.state.extraTurns++; // 잡기 추가 턴
    }

    // 업기 판정
    this.checkStack(playerIndex, malIndex, targetPosition);

    // 골인 판정
    if (targetPosition === 30) {
      mal.position = 30;
      // 업힌 말도 함께 골인
      for (const stackedIdx of Array.from(mal.stackedWith)) {
        player.mals[stackedIdx].position = 30;
      }
    }

    // 턴 로그 기록
    this.turnLog.push({
      turnNumber: this.turnLog.length + 1,
      playerId: player.userId,
      yutResult: this.state.lastYutResult.result,
      selectedMal: malIndex,
      fromPosition: previousPosition,
      toPosition: targetPosition,
      caught: catchResult.caughtPlayerId ?? null,
      timestamp: Date.now(),
    });

    // 승리 체크
    const winResult = this.winChecker.check(this.state.players, this.state.mode);
    if (winResult.isGameOver) {
      this.endGame(winResult.winnerTeam, 'complete');
      return;
    }

    // 다음 턴 진행
    this.advanceTurn();
  }

  private checkCatch(
    attackerPlayerIndex: number,
    targetPosition: number
  ): { caught: boolean; caughtPlayerId: string | null } {
    const attackerTeam = this.state.players[attackerPlayerIndex].team;

    for (const player of this.state.players) {
      if (player.team === attackerTeam) continue; // 같은 팀 스킵

      for (const mal of player.mals) {
        if (mal.position === targetPosition && targetPosition !== -1 && targetPosition !== 30) {
          // 잡기! 해당 말(및 업힌 말)을 출발점으로
          mal.position = -1;
          mal.isStacked = false;
          for (const stackedIdx of Array.from(mal.stackedWith)) {
            player.mals[stackedIdx].position = -1;
            player.mals[stackedIdx].isStacked = false;
            player.mals[stackedIdx].stackedWith.clear();
          }
          mal.stackedWith.clear();

          return { caught: true, caughtPlayerId: player.userId };
        }
      }
    }
    return { caught: false, caughtPlayerId: null };
  }

  private checkStack(playerIndex: number, movedMalIndex: number, targetPosition: number) {
    const player = this.state.players[playerIndex];
    const movedMal = player.mals[movedMalIndex];

    for (let i = 0; i < player.mals.length; i++) {
      if (i === movedMalIndex) continue;
      const otherMal = player.mals[i];
      if (otherMal.position === targetPosition && targetPosition !== -1 && targetPosition !== 30) {
        // 업기
        movedMal.isStacked = true;
        otherMal.isStacked = true;
        if (!movedMal.stackedWith.includes(i)) movedMal.stackedWith.push(i);
        if (!otherMal.stackedWith.includes(movedMalIndex)) otherMal.stackedWith.push(movedMalIndex);
      }
    }
  }

  private advanceTurn() {
    if (this.state.extraTurns > 0) {
      this.state.extraTurns--;
      this.state.turnPhase = 'throw';
      this.resetTurnTimer();
      return;
    }

    // 다음 플레이어
    this.turnManager.nextTurn();
    this.state.turnPhase = 'throw';
    this.startTurnTimer();
  }

  private handleSendBubble(client: Client, message: SendBubbleMessage) {
    // 쿨다운 체크 (3초)
    // 전체 브로드캐스트
    this.broadcast('bubble', {
      playerIndex: this.getPlayerIndex(client),
      bubbleType: message.bubbleType, // 0~3
    });
  }

  private handleSurrender(client: Client) {
    const playerIndex = this.getPlayerIndex(client);
    const player = this.state.players[playerIndex];
    const loserTeam = player.team;
    const winnerTeam = loserTeam === 0 ? 1 : 0;
    this.endGame(winnerTeam, 'surrender');
  }

  // --- 턴 타이머 ---

  private startTurnTimer() {
    this.clearTurnTimer();
    this.state.turnTimer = this.state.turnTimeLimit;

    this.turnTimer = this.clock.setInterval(() => {
      this.state.turnTimer--;
      if (this.state.turnTimer <= 0) {
        this.handleTurnTimeout();
      }
    }, 1000);
  }

  private resetTurnTimer() {
    this.clearTurnTimer();
    // 말 선택 시간: 전체 턴 시간 - 5초 (윷 던지기 시간)
    this.state.turnTimer = this.state.turnTimeLimit - 5;
    this.turnTimer = this.clock.setInterval(() => {
      this.state.turnTimer--;
      if (this.state.turnTimer <= 0) {
        this.handleTurnTimeout();
      }
    }, 1000);
  }

  private clearTurnTimer() {
    if (this.turnTimer) {
      this.turnTimer.clear();
      this.turnTimer = null;
    }
  }

  private handleTurnTimeout() {
    const currentPlayer = this.state.players[this.state.currentTurn];

    if (this.state.turnPhase === 'throw') {
      // 자동 던지기
      const result = this.yutEngine.generateResult('normal');
      this.state.lastYutResult.result = result.type;
      this.state.lastYutResult.moveAmount = result.moveAmount;
      this.state.lastYutResult.grantsExtraTurn = result.grantsExtraTurn;
      if (result.grantsExtraTurn) this.state.extraTurns++;
      this.state.turnPhase = 'move';
      this.resetTurnTimer();
    } else if (this.state.turnPhase === 'move' || this.state.turnPhase === 'path_choice') {
      // 가장 뒤에 있는 말 자동 이동
      this.autoMoveMal(currentPlayer);
      currentPlayer.consecutiveTimeouts++;

      if (currentPlayer.consecutiveTimeouts >= 3) {
        const winnerTeam = currentPlayer.team === 0 ? 1 : 0;
        this.endGame(winnerTeam, 'timeout');
        return;
      }
    }
  }

  private autoMoveMal(player: PlayerState) {
    // 이동 가능한 말 중 가장 뒤에 있는 말 선택
    const moveAmount = this.state.lastYutResult.moveAmount;
    let bestMal = -1;
    let minPosition = 999;

    for (let i = 0; i < player.mals.length; i++) {
      const mal = player.mals[i];
      if (mal.position === 30) continue; // 골인한 말 제외
      if (mal.position === -1 && moveAmount < 0) continue; // 대기 중 말은 백도 불가
      if (mal.position < minPosition) {
        minPosition = mal.position;
        bestMal = i;
      }
    }

    if (bestMal >= 0) {
      const validation = this.moveValidator.validate(
        player.mals[bestMal],
        moveAmount,
        this.state.players,
        player.playerIndex
      );
      if (validation.isValid) {
        this.executeMalMove(
          player.playerIndex,
          bestMal,
          validation.targetPosition,
          validation.path
        );
        return;
      }
    }

    // 이동 가능한 말이 없으면 턴 넘김
    this.advanceTurn();
  }

  // --- 재접속 ---

  async onLeave(client: Client, consented: boolean) {
    const playerIndex = this.getPlayerIndex(client);
    if (playerIndex < 0) return;

    this.state.players[playerIndex].isConnected = false;

    try {
      if (!consented) {
        // 비자발적 이탈 → 30초 재접속 대기
        await this.allowReconnection(client, 30);
        this.state.players[playerIndex].isConnected = true;
      } else {
        // 자발적 나가기 → 즉시 패배 처리
        const loserTeam = this.state.players[playerIndex].team;
        const winnerTeam = loserTeam === 0 ? 1 : 0;
        this.endGame(winnerTeam, 'disconnect');
      }
    } catch {
      // 재접속 타임아웃 → 패배 처리
      const loserTeam = this.state.players[playerIndex].team;
      const winnerTeam = loserTeam === 0 ? 1 : 0;
      this.endGame(winnerTeam, 'disconnect');
    }
  }

  // --- 게임 종료 ---

  private async endGame(winnerTeam: number, reason: string) {
    this.state.phase = 'finished';
    this.state.winnerTeam = winnerTeam;
    this.state.winReason = reason;
    this.clearTurnTimer();

    // Glicko-2 레이팅 업데이트 (랭크전만)
    if (this.state.isRanked) {
      await this.updateRatings(winnerTeam);
    }

    // 게임 기록 저장
    await this.gameRecordService.save({
      mode: this.state.mode as '1v1' | '2v2',
      players: this.state.players.map((p) => ({
        userId: p.userId,
        team: p.team,
        ratingBefore: p.rating,
        ratingAfter: p.rating, // 업데이트 후
        isWinner: p.team === winnerTeam,
      })),
      turns: this.turnLog,
      result: { winnerTeam, reason, duration: 0 /* 계산 */ },
    });

    // 리더보드 업데이트
    for (const player of this.state.players) {
      if (player.team === winnerTeam) {
        await this.leaderboardService.incrementMonthlyWins(player.userId);
      }
      await this.userService.updateStats(player.userId, player.team === winnerTeam);
    }

    // 패널티 처리 (이탈로 인한 종료 시)
    if (reason === 'disconnect') {
      for (const player of this.state.players) {
        if (!player.isConnected) {
          await this.penaltyChecker.recordDisconnect(player.userId);
        }
      }
    }

    // game_over 메시지
    this.broadcast('game_over', {
      winnerTeam,
      reason,
    });

    // 10초 후 방 자동 해제
    this.clock.setTimeout(() => {
      this.disconnect();
    }, 10_000);
  }

  // 2v2에서는 팀 승패 결과를 한 번에 모아 갱신 (이중 루프로 중복 갱신하지 않음)
  private async updateRatings(winnerTeam: number) {
    const winners = this.state.players.filter((p) => p.team === winnerTeam);
    const losers = this.state.players.filter((p) => p.team !== winnerTeam);

    // 팀 평균 레이팅으로 단일 Glicko-2 계산 후 각 플레이어에 반영
    const avgWinnerRating = winners.reduce((sum, p) => sum + p.rating, 0) / winners.length;
    const avgLoserRating = losers.reduce((sum, p) => sum + p.rating, 0) / losers.length;

    const [newWinnerRating, newLoserRating] = GlickoRating.calculate(
      { rating: avgWinnerRating, rd: 350, vol: 0.06 },
      { rating: avgLoserRating, rd: 350, vol: 0.06 },
      1 // winner won
    );

    // 팀 단위 갱신: 평균 레이팅 변동분을 각 플레이어에 적용
    const winnerDelta = newWinnerRating - avgWinnerRating;
    const loserDelta = newLoserRating - avgLoserRating;

    for (const winner of winners) {
      await this.userService.updateRating(winner.userId, winner.rating + winnerDelta);
    }
    for (const loser of losers) {
      await this.userService.updateRating(loser.userId, loser.rating + loserDelta);
    }
  }

  private getPlayerIndex(client: Client): number {
    return this.state.players.findIndex((p) => p.userId === (client.auth as any)?.uid);
  }

  onDispose() {
    this.clearTurnTimer();
  }
}
```

### 4.4 메시지 프로토콜 (전체 목록)

```typescript
// packages/shared/src/types/messages.ts

// ===== 클라이언트 → 서버 =====

/** 윷 던지기 요청 */
export interface ThrowYutMessage {
  type: 'throw_yut';
  gaugeZone?: 'perfect' | 'good' | 'normal' | 'bad'; // 스킬 모드에서만
}

/** 말 이동 요청 */
export interface MoveMalMessage {
  type: 'move_mal';
  malIndex: number; // 0~3 (1v1) 또는 0~1 (2v2)
}

/** 지름길 경로 선택 */
export interface SelectPathMessage {
  type: 'select_path';
  useShortcut: boolean;
}

/** 말풍선 메시지 전송 */
export interface SendBubbleMessage {
  type: 'send_bubble';
  bubbleType: 0 | 1 | 2 | 3; // 0:"미안해요" 1:"잘했어요" 2:"빨리 주세요" 3:"왔어요"
}

/** 기권 */
export interface SurrenderMessage {
  type: 'surrender';
}

/** 매칭 취소 */
export interface CancelMatchingMessage {
  type: 'cancel_matching';
}

export type ClientMessage =
  | ThrowYutMessage
  | MoveMalMessage
  | SelectPathMessage
  | SendBubbleMessage
  | SurrenderMessage
  | CancelMatchingMessage;

// ===== 서버 → 클라이언트 (broadcast) =====

/** 말풍선 표시 */
export interface BubbleBroadcast {
  type: 'bubble';
  playerIndex: number;
  bubbleType: 0 | 1 | 2 | 3;
}

/** 게임 종료 */
export interface GameOverBroadcast {
  type: 'game_over';
  winnerTeam: number;
  reason: 'complete' | 'surrender' | 'disconnect' | 'timeout';
}

/** 재접속 대기 알림 */
export interface ReconnectingBroadcast {
  type: 'player_reconnecting';
  playerIndex: number;
  remainingSeconds: number;
}

/** 에러 메시지 */
export interface ErrorBroadcast {
  type: 'error';
  code: string;
  message: string;
}

/** 이동 가능 목록 알림 */
export interface AvailableMovesBroadcast {
  type: 'available_moves';
  moves: Array<{ malIndex: number; targetPosition: number; path: number[] }>;
}

/** 턴 변경 명시적 알림 */
export interface TurnChangedBroadcast {
  type: 'turn_changed';
  currentTurn: number;
  turnPhase: 'throw' | 'move';
  extraTurns: number;
}

export type ServerBroadcast =
  | BubbleBroadcast
  | GameOverBroadcast
  | ReconnectingBroadcast
  | ErrorBroadcast
  | AvailableMovesBroadcast
  | TurnChangedBroadcast;
```

### 4.5 TurnManager 상세

```typescript
// apps/server/src/engine/TurnManager.ts
import { Clock } from 'colyseus';
import { GameState } from '../rooms/schema/GameState';

export class TurnManager {
  private turnOrderIndex: number = 0;

  constructor(
    private state: GameState,
    private clock: Clock
  ) {}

  /** 다음 턴 플레이어로 이동 */
  nextTurn() {
    this.turnOrderIndex = (this.turnOrderIndex + 1) % this.state.turnOrder.length;
    this.state.currentTurn = this.state.turnOrder[this.turnOrderIndex];

    // 연결 끊긴 플레이어 건너뛰기
    const player = this.state.players[this.state.currentTurn];
    if (!player.isConnected) {
      // 재귀적으로 다음 플레이어 탐색 (무한 루프 방지: 최대 turnOrder.length회)
      const maxSkips = this.state.turnOrder.length;
      for (let i = 0; i < maxSkips; i++) {
        this.turnOrderIndex = (this.turnOrderIndex + 1) % this.state.turnOrder.length;
        this.state.currentTurn = this.state.turnOrder[this.turnOrderIndex];
        const next = this.state.players[this.state.currentTurn];
        if (next.isConnected) break;
      }
    }

    this.state.turnTimer = this.state.turnTimeLimit;
  }

  /** 현재 플레이어 인덱스 */
  getCurrentPlayerIndex(): number {
    return this.state.currentTurn;
  }

  /** 2v2 팀원 인덱스 */
  getTeammateIndex(playerIndex: number): number | null {
    if (this.state.mode !== '2v2') return null;
    const team = this.state.players[playerIndex].team;
    for (const p of this.state.players) {
      if (p.team === team && p.playerIndex !== playerIndex) {
        return p.playerIndex;
      }
    }
    return null;
  }
}
```

### 4.6 YutEngine (윷 결과 생성)

```typescript
// apps/server/src/engine/YutEngine.ts
import type { GaugeZone, YutResultType } from '@yut/shared';
import { YUT_PROBABILITIES, GAUGE_MODIFIERS } from '@yut/shared';

interface YutEngineResult {
  type: YutResultType; // 'do' | 'gae' | 'geol' | 'yut' | 'mo' | 'backdo'
  moveAmount: number;  // 1, 2, 3, 4, 5, -1
  grantsExtraTurn: boolean;
}

export class YutEngine {
  /**
   * 윷 결과 생성
   * @param gaugeZone 게이지 판정 영역 ('perfect' | 'good' | 'normal' | 'bad')
   */
  generateResult(gaugeZone: GaugeZone = 'normal'): YutEngineResult {
    // 기본 확률 테이블
    const baseProbabilities = { ...YUT_PROBABILITIES };

    // 게이지 보정 적용
    const modifiers = GAUGE_MODIFIERS[gaugeZone];
    const adjusted = {
      do: baseProbabilities.do + (modifiers.do ?? 0),
      gae: baseProbabilities.gae + (modifiers.gae ?? 0),
      geol: baseProbabilities.geol + (modifiers.geol ?? 0),
      yut: baseProbabilities.yut + (modifiers.yut ?? 0),
      mo: baseProbabilities.mo + (modifiers.mo ?? 0),
    };

    // 정규화 (합이 1이 되도록)
    const total = Object.values(adjusted).reduce((a, b) => a + b, 0);
    const normalized = Object.fromEntries(
      Object.entries(adjusted).map(([k, v]) => [k, v / total])
    ) as Record<string, number>;

    // 가중 랜덤 샘플링
    const rand = Math.random();
    let cumulative = 0;
    let selectedResult: YutResultType = 'do';

    for (const [result, prob] of Object.entries(normalized)) {
      cumulative += prob;
      if (rand <= cumulative) {
        selectedResult = result as YutResultType;
        break;
      }
    }

    // 백도 특별 판정: '도'가 나왔을 때 추가 확률로 백도 변환
    if (selectedResult === 'do') {
      // 전통 윷에서 백도 확률: 도가 나왔을 때 약 3~4% (1개만 뒤집힌 상태에서 특수 면이 보이는 경우)
      if (Math.random() < 0.04) {
        selectedResult = 'backdo';
      }
    }

    return {
      type: selectedResult,
      moveAmount: this.getMoveAmount(selectedResult),
      grantsExtraTurn: selectedResult === 'yut' || selectedResult === 'mo',
    };
  }

  private getMoveAmount(result: YutResultType): number {
    const moveMap: Record<YutResultType, number> = {
      do: 1,
      gae: 2,
      geol: 3,
      yut: 4,
      mo: 5,
      backdo: -1,
    };
    return moveMap[result];
  }
}
```

```typescript
// packages/shared/src/game/YutProbability.ts

/** 기본 확률 테이블 (합 = 1.0) */
export const YUT_PROBABILITIES = {
  do: 0.25,    // 도 25%
  gae: 0.31,   // 개 31%
  geol: 0.25,  // 걸 25%
  yut: 0.13,   // 윷 13%
  mo: 0.06,    // 모 6%
} as const;

/** 게이지 영역별 확률 보정치 (percentage points) */
export const GAUGE_MODIFIERS: Record<string, Record<string, number>> = {
  perfect: { do: -0.02, gae: 0, geol: 0, yut: 0.01, mo: 0.01 },
  good:    { do: -0.01, gae: 0, geol: 0, yut: 0.005, mo: 0.005 },
  normal:  { do: 0, gae: 0, geol: 0, yut: 0, mo: 0 },
  bad:     { do: 0.02, gae: 0, geol: 0, yut: -0.005, mo: -0.005 },
} as const;
```

### 4.7 매치메이킹 로직

```typescript
// apps/server/src/matchmaking/MatchmakingQueue.ts
import { getRedisClient } from '../config/redis';
import { GlickoRating } from '../engine/GlickoRating';

interface QueueEntry {
  userId: string;
  rating: number;
  mode: '1v1' | '2v2';
  gaugeMode: 'classic' | 'skill';
  queuedAt: number;
}

export class MatchmakingQueue {
  private readonly QUEUE_KEY_PREFIX = 'matchmaking:queue:';
  private readonly RANGE_EXPANSION = [200, 400, 800, Infinity]; // 레이팅 범위 확장 단계
  private readonly EXPANSION_INTERVAL = 5000; // 5초마다 범위 확장

  /**
   * 매칭 큐에 등록
   */
  async enqueue(entry: QueueEntry): Promise<void> {
    const redis = getRedisClient();
    const key = this.getQueueKey(entry.mode, entry.gaugeMode);

    await redis.zadd(key, entry.rating, JSON.stringify({
      userId: entry.userId,
      rating: entry.rating,
      queuedAt: Date.now(),
    }));
  }

  /**
   * 매칭 큐에서 제거
   */
  async dequeue(userId: string, mode: string, gaugeMode: string): Promise<void> {
    const redis = getRedisClient();
    const key = this.getQueueKey(mode, gaugeMode);
    // ZSCAN으로 userId 찾아 제거
    const members = await redis.zrangebyscore(key, '-inf', '+inf');
    for (const member of members) {
      const parsed = JSON.parse(member);
      if (parsed.userId === userId) {
        await redis.zrem(key, member);
        break;
      }
    }
  }

  /**
   * 상대 찾기
   * @returns 매칭된 상대 userId 또는 null
   */
  async findMatch(entry: QueueEntry): Promise<QueueEntry | null> {
    const redis = getRedisClient();
    const key = this.getQueueKey(entry.mode, entry.gaugeMode);
    const elapsed = Date.now() - entry.queuedAt;

    // 경과 시간에 따른 레이팅 범위 확장
    const expansionStep = Math.min(
      Math.floor(elapsed / this.EXPANSION_INTERVAL),
      this.RANGE_EXPANSION.length - 1
    );
    const range = this.RANGE_EXPANSION[expansionStep];

    const minRating = range === Infinity ? '-inf' : String(entry.rating - range);
    const maxRating = range === Infinity ? '+inf' : String(entry.rating + range);

    const candidates = await redis.zrangebyscore(key, minRating, maxRating);

    for (const candidate of candidates) {
      const parsed = JSON.parse(candidate) as QueueEntry;
      if (parsed.userId === entry.userId) continue; // 자기 자신 제외
      return parsed;
    }

    return null;
  }

  /**
   * 2v2 매칭: 4명 모으기
   */
  async find2v2Match(entry: QueueEntry): Promise<QueueEntry[] | null> {
    const redis = getRedisClient();
    const key = this.getQueueKey('2v2', entry.gaugeMode);
    const elapsed = Date.now() - entry.queuedAt;
    const expansionStep = Math.min(
      Math.floor(elapsed / this.EXPANSION_INTERVAL),
      this.RANGE_EXPANSION.length - 1
    );
    const range = this.RANGE_EXPANSION[expansionStep];

    const minRating = range === Infinity ? '-inf' : String(entry.rating - range);
    const maxRating = range === Infinity ? '+inf' : String(entry.rating + range);

    const candidates = await redis.zrangebyscore(key, minRating, maxRating);
    const others = candidates
      .map((c) => JSON.parse(c) as QueueEntry)
      .filter((c) => c.userId !== entry.userId);

    if (others.length >= 3) {
      // 레이팅 가장 가까운 3명 선택
      others.sort((a, b) =>
        Math.abs(a.rating - entry.rating) - Math.abs(b.rating - entry.rating)
      );
      return others.slice(0, 3);
    }

    return null;
  }

  private getQueueKey(mode: string, gaugeMode: string): string {
    return `${this.QUEUE_KEY_PREFIX}${mode}:${gaugeMode}`;
  }
}
```

### 4.8 재접속 처리

재접속 플로우는 4.3절 `onLeave` 핸들러에서 구현. 핵심:

1. **비자발적 이탈** (네트워크 끊김): `allowReconnection(client, 30)` — 30초 유예
2. **자발적 이탈** (나가기 버튼): 즉시 패배 처리
3. **재접속 성공**: Colyseus가 자동으로 현재 GameState를 delta sync로 전송 → 클라이언트 상태 복원
4. **재접속 실패**: 타임아웃 → 패배 처리 + 이탈 카운터 증가

클라이언트 측 재접속:
```typescript
// src/services/colyseus.ts (재접속 관련)
import { Client, Room } from 'colyseus.js';

class ColyseusService {
  private client: Client;
  private room: Room | null = null;
  private reconnectionToken: string | null = null;

  constructor() {
    this.client = new Client(process.env.EXPO_PUBLIC_COLYSEUS_URL!);
  }

  async joinRoom(roomName: string, options: any): Promise<Room> {
    this.room = await this.client.joinOrCreate(roomName, options);
    this.reconnectionToken = this.room.reconnectionToken;
    return this.room;
  }

  async reconnect(): Promise<Room | null> {
    if (!this.reconnectionToken) return null;
    try {
      this.room = await this.client.reconnect(this.reconnectionToken);
      this.reconnectionToken = this.room.reconnectionToken;
      return this.room;
    } catch {
      this.reconnectionToken = null;
      return null;
    }
  }

  getRoom(): Room | null {
    return this.room;
  }
}

export const colyseusService = new ColyseusService();
```

---

## 5. 윷판 데이터 모델

### 5.1 칸 번호 체계

```
윷판 노드 번호 배치:

          10
        /    \
      11      9
      |        |
      12   15  8
      |  /   \ |
      13  16  7
      | / 20 \ |
      14  /\  6
      | 19  17 |
      | |    | |
      15  18  5
       \      /
    --- 0 --- 4
    |           |
    1    2    3

외곽 경로 (시계 반대 방향):
  0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
  → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 0(골인)

지름길 경로:
  - 5번(우하 모서리) → 20 → 21 → 22(중앙) → ...
  - 10번(우상 모서리) → 23 → 24 → 22(중앙) → ...
  - 22(중앙) → 25 → 26 → 0(골인)  (좌하 대각선)
```

실제 구현:

```typescript
// packages/shared/src/board/BoardConstants.ts

/** 윷판 노드 ID. 총 29개 + 출발(-1) + 골인(30) */
export const NODE = {
  START: -1,           // 출발 전 대기
  GOAL: 30,            // 골인

  // 외곽 경로 (0~19, 시계 반대 방향)
  OUTER_START: 0,      // 출발점 (= 골인 지점)
  CORNER_BR: 5,        // 우하 모서리
  CORNER_TR: 10,       // 우상 모서리
  CORNER_TL: 15,       // 좌상 모서리
  // 좌하 모서리 = OUTER_START (0) = 골인

  // 지름길 경로
  SHORTCUT_BR_1: 20,   // 우하→중앙 첫번째
  SHORTCUT_BR_2: 21,   // 우하→중앙 두번째
  CENTER: 22,          // 중앙 교차점
  SHORTCUT_TR_1: 23,   // 우상→중앙 첫번째
  SHORTCUT_TR_2: 24,   // 우상→중앙 두번째
  SHORTCUT_EXIT_1: 25, // 중앙→좌하 첫번째
  SHORTCUT_EXIT_2: 26, // 중앙→좌하 두번째

  // 좌상 모서리 지름길 (15번에서 중앙으로)
  SHORTCUT_TL_1: 27,   // 좌상→중앙 첫번째
  SHORTCUT_TL_2: 28,   // 좌상→중앙 두번째
} as const;

export type NodeId = number;

/** 각 노드의 다음 노드 (외곽 경로 기본) */
export const OUTER_PATH: Record<number, number> = {
  0: 1, 1: 2, 2: 3, 3: 4, 4: 5,
  5: 6, 6: 7, 7: 8, 8: 9, 9: 10,
  10: 11, 11: 12, 12: 13, 13: 14, 14: 15,
  15: 16, 16: 17, 17: 18, 18: 19, 19: 30, // 19 → 골인
};

/** 지름길 경로 */
export const SHORTCUT_PATHS: Record<number, number> = {
  // 우하 모서리(5)에서 진입
  20: 21, 21: 22,
  // 우상 모서리(10)에서 진입
  23: 24, 24: 22,
  // 좌상 모서리(15)에서 진입
  27: 28, 28: 22,
  // 중앙(22)에서 골인 방향
  22: 25, 25: 26, 26: 30, // → 골인
};

/** 지름길 진입 가능한 모서리 노드 → 지름길 첫 노드 */
export const SHORTCUT_ENTRIES: Record<number, number> = {
  5: 20,   // 우하 모서리 → 지름길 시작
  10: 23,  // 우상 모서리 → 지름길 시작
  15: 27,  // 좌상 모서리 → 지름길 시작
};

/** 노드가 지름길에 있는지 확인 */
export function isOnShortcut(nodeId: number): boolean {
  return nodeId >= 20 && nodeId <= 28;
}

/** 모서리 노드인지 확인 (지름길 선택 가능) */
export function isCornerNode(nodeId: number): boolean {
  return nodeId === 5 || nodeId === 10 || nodeId === 15;
}
```

### 5.2 윷판 그래프 구조

```typescript
// packages/shared/src/board/BoardGraph.ts

interface BoardNode {
  id: number;
  x: number;     // 윷판 내 정규화 좌표 (0~1)
  y: number;
  isCorner: boolean;
  isCenter: boolean;
  isStart: boolean;
  nextOuter: number | null;       // 외곽 경로의 다음 노드
  nextShortcut: number | null;    // 지름길 경로의 다음 노드 (모서리/중앙에서만)
}

/** 윷판 그래프 (싱글톤) */
export class BoardGraph {
  private nodes: Map<number, BoardNode> = new Map();

  constructor() {
    this.buildGraph();
  }

  private buildGraph() {
    // 외곽 노드 (0~19) — 정사각형 배치
    const outerPositions = this.calculateOuterPositions();
    for (let i = 0; i <= 19; i++) {
      const pos = outerPositions[i];
      this.nodes.set(i, {
        id: i,
        x: pos.x,
        y: pos.y,
        isCorner: [0, 5, 10, 15].includes(i),
        isCenter: false,
        isStart: i === 0,
        nextOuter: i < 19 ? i + 1 : 30, // 19 → 골인
        nextShortcut: SHORTCUT_ENTRIES[i] ?? null,
      });
    }

    // 지름길 노드 (20~28)
    const shortcutPositions = this.calculateShortcutPositions();
    for (let i = 20; i <= 28; i++) {
      const pos = shortcutPositions[i];
      this.nodes.set(i, {
        id: i,
        x: pos.x,
        y: pos.y,
        isCorner: false,
        isCenter: i === 22,
        isStart: false,
        nextOuter: null,
        nextShortcut: SHORTCUT_PATHS[i] ?? null,
      });
    }
  }

  /**
   * 외곽 20칸의 정규화 좌표 계산
   * 윷판은 정사각형이며, 각 변에 5칸씩 배치 (모서리 포함)
   *
   *        10 - 9 - 8 - 7 - 6
   *        |                  |
   *       11                  5
   *        |                  |
   *       12                  4
   *        |                  |
   *       13                  3
   *        |                  |
   *       14                  2
   *        |                  |
   *        15 - 16 - 17 - 18 - 19 - (0/골인)
   *
   * 0번 = 좌하 (출발/골인)
   */
  private calculateOuterPositions(): Record<number, { x: number; y: number }> {
    const positions: Record<number, { x: number; y: number }> = {};
    const step = 1 / 5; // 5칸 간격

    // 반시계 방향 (기획서 일치): 우하(출발) → 우상 → 좌상 → 좌하(골인)
    // 하단 변 (0 → 5): 우 → 좌 (반시계 방향)
    for (let i = 0; i <= 5; i++) {
      positions[i] = { x: 1.0 - i * step, y: 1.0 };
    }
    // 좌측 변 (5 → 10): 하 → 상 (반시계 방향)
    for (let i = 1; i <= 5; i++) {
      positions[5 + i] = { x: 0.0, y: 1.0 - i * step };
    }
    // 상단 변 (10 → 15): 좌 → 우 (반시계 방향)
    for (let i = 1; i <= 5; i++) {
      positions[10 + i] = { x: i * step, y: 0.0 };
    }
    // 우측 변 (15 → 19): 상 → 하 (19 = 0번 직전, 반시계 방향)
    for (let i = 1; i <= 4; i++) {
      positions[15 + i] = { x: 1.0, y: i * step };
    }

    return positions;
  }

  private calculateShortcutPositions(): Record<number, { x: number; y: number }> {
    return {
      // 우하(5) → 중앙(22) 대각선 (5번 = (1,1) → 중앙 = (0.5,0.5))
      20: { x: 0.8, y: 0.8 },     // 우하 → 중앙 1/3 지점
      21: { x: 0.65, y: 0.65 },   // 우하 → 중앙 2/3 지점

      22: { x: 0.5, y: 0.5 },     // 중앙 교차점

      // 우상(10) → 중앙 대각선 (10번 = (1, 0))
      23: { x: 0.8, y: 0.2 },     // 우상 → 중앙 1/3
      24: { x: 0.65, y: 0.35 },   // 우상 → 중앙 2/3

      // 중앙(22) → 좌하(0) 대각선 (0번 = (0, 1))
      25: { x: 0.35, y: 0.65 },   // 중앙 → 좌하 1/3
      26: { x: 0.2, y: 0.8 },     // 중앙 → 좌하 2/3

      // 좌상(15) → 중앙 대각선 (15번 = (0, 0))
      27: { x: 0.2, y: 0.2 },     // 좌상 → 중앙 1/3
      28: { x: 0.35, y: 0.35 },   // 좌상 → 중앙 2/3
    };
  }

  getNode(id: number): BoardNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): BoardNode[] {
    return Array.from(this.nodes.values());
  }
}

export const boardGraph = new BoardGraph();
```

### 5.3 경로 계산 알고리즘

```typescript
// packages/shared/src/board/PathCalculator.ts
import {
  OUTER_PATH,
  SHORTCUT_PATHS,
  SHORTCUT_ENTRIES,
  isOnShortcut,
  isCornerNode,
  NODE,
} from './BoardConstants';

export interface PathResult {
  targetPosition: number;
  path: number[];              // 경유 노드 목록 (애니메이션용)
  requiresPathChoice: boolean; // 지름길 선택 필요 여부
  shortcutPath?: number[];     // 지름길 경유 시 경로
  normalPath?: number[];       // 외곽 경유 시 경로
}

export class PathCalculator {
  /**
   * 말 이동 경로 계산
   * @param fromPosition 현재 위치 (-1: 출발 전)
   * @param moveAmount 이동 칸수 (음수: 백도)
   * @param isOnShortcutPath 현재 지름길 위에 있는지
   */
  calculate(
    fromPosition: number,
    moveAmount: number,
    isOnShortcutPath: boolean
  ): PathResult {
    // 출발 전 상태에서 이동
    if (fromPosition === NODE.START) {
      if (moveAmount < 0) {
        // 백도: 대기 중인 말은 이동 불가
        return { targetPosition: NODE.START, path: [], requiresPathChoice: false };
      }
      // 출발점(0)에서 moveAmount만큼 이동
      return this.walkFromNode(0, moveAmount - 1, false);
    }

    // 백도 처리
    if (moveAmount < 0) {
      return this.walkBackward(fromPosition, Math.abs(moveAmount), isOnShortcutPath);
    }

    // 일반 이동
    return this.walkFromNode(fromPosition, moveAmount, isOnShortcutPath);
  }

  private walkFromNode(
    startNode: number,
    steps: number,
    onShortcut: boolean
  ): PathResult {
    const path: number[] = [startNode];
    let current = startNode;
    let remainingSteps = steps;
    let requiresPathChoice = false;
    let shortcutPath: number[] | undefined;
    let normalPath: number[] | undefined;

    while (remainingSteps > 0) {
      let nextNode: number;

      if (onShortcut || isOnShortcut(current)) {
        // 지름길 경로를 따라감
        nextNode = SHORTCUT_PATHS[current] ?? NODE.GOAL;
        onShortcut = true;
      } else {
        nextNode = OUTER_PATH[current] ?? NODE.GOAL;
      }

      // 모서리 도착 시 분기 체크
      if (isCornerNode(nextNode) && remainingSteps === 1 && !onShortcut) {
        // 정확히 모서리에 도착 → 지름길 선택 필요
        path.push(nextNode);

        // 양쪽 경로 계산 (UI에서 선택)
        shortcutPath = [nextNode];
        normalPath = [nextNode];

        requiresPathChoice = true;
        return {
          targetPosition: nextNode,
          path,
          requiresPathChoice,
          shortcutPath,
          normalPath,
        };
      }

      if (nextNode === NODE.GOAL) {
        // 골인
        path.push(NODE.GOAL);
        return { targetPosition: NODE.GOAL, path, requiresPathChoice: false };
      }

      current = nextNode;
      path.push(current);
      remainingSteps--;
    }

    return {
      targetPosition: current,
      path,
      requiresPathChoice,
      shortcutPath,
      normalPath,
    };
  }

  private walkBackward(
    fromPosition: number,
    steps: number,
    onShortcut: boolean
  ): PathResult {
    // 백도: 이전 경로를 역추적
    // 지름길 위에 있으면 지름길 역방향, 외곽이면 외곽 역방향
    const path: number[] = [fromPosition];
    let current = fromPosition;

    for (let i = 0; i < steps; i++) {
      const prev = this.findPreviousNode(current, onShortcut);
      if (prev === null) {
        // 출발점(0) 이전으로 갈 수 없음 → 출발점 대기로
        return { targetPosition: NODE.START, path, requiresPathChoice: false };
      }
      current = prev;
      path.push(current);
    }

    return { targetPosition: current, path, requiresPathChoice: false };
  }

  private findPreviousNode(nodeId: number, onShortcut: boolean): number | null {
    if (onShortcut || isOnShortcut(nodeId)) {
      // 지름길 역방향 탐색
      for (const [from, to] of Object.entries(SHORTCUT_PATHS)) {
        if (to === nodeId) return Number(from);
      }
      // 지름길 입구에서 역방향 → 모서리로
      for (const [corner, entry] of Object.entries(SHORTCUT_ENTRIES)) {
        if (entry === nodeId) return Number(corner);
      }
    }

    // 외곽 역방향
    for (const [from, to] of Object.entries(OUTER_PATH)) {
      if (to === nodeId) return Number(from);
    }

    return null;
  }
}
```

---

## 6. AI 엔진 설계

### 6.1 아키텍처

AI 대전은 네트워크 없이 클라이언트 로컬에서 실행된다. `@yut/shared`의 게임 로직을 직접 사용한다.

```typescript
// src/ai/AIGameEngine.ts
import { PathCalculator, WinCondition, CatchLogic, StackLogic, YutProbability } from '@yut/shared';
import type { YutResultType, GaugeZone } from '@yut/shared';
import { AIPlayer } from './AIPlayer';

interface LocalGameState {
  phase: 'playing' | 'finished';
  currentTurn: number; // 0: 플레이어, 1: AI
  players: LocalPlayer[];
  extraTurns: number;
  lastYutResult: YutResultType | null;
}

interface LocalPlayer {
  isAI: boolean;
  mals: { position: number; isStacked: boolean; stackedWith: number[]; isOnShortcut: boolean }[];
}

export class AIGameEngine {
  private state: LocalGameState;
  private pathCalculator = new PathCalculator();
  private aiPlayer: AIPlayer;
  private onStateChange: (state: LocalGameState) => void;

  constructor(
    difficulty: 'easy' | 'medium' | 'hard',
    gaugeMode: 'classic' | 'skill',
    onStateChange: (state: LocalGameState) => void
  ) {
    this.aiPlayer = new AIPlayer(difficulty);
    this.onStateChange = onStateChange;

    // 초기 상태
    this.state = {
      phase: 'playing',
      currentTurn: Math.random() < 0.5 ? 0 : 1,
      players: [
        { isAI: false, mals: Array(4).fill(null).map(() => ({ position: -1, isStacked: false, stackedWith: [], isOnShortcut: false })) },
        { isAI: true, mals: Array(4).fill(null).map(() => ({ position: -1, isStacked: false, stackedWith: [], isOnShortcut: false })) },
      ],
      extraTurns: 0,
      lastYutResult: null,
    };
  }

  /** 플레이어가 윷을 던짐 */
  playerThrowYut(gaugeZone: GaugeZone = 'normal'): YutResultType {
    const result = this.generateYutResult(gaugeZone);
    this.state.lastYutResult = result;
    if (result === 'yut' || result === 'mo') {
      this.state.extraTurns++;
    }
    this.onStateChange({ ...this.state });
    return result;
  }

  /** 플레이어가 말을 선택하여 이동 */
  playerMoveMal(malIndex: number, useShortcut?: boolean) {
    this.executeMalMove(0, malIndex, useShortcut);
    this.checkWinAndAdvance();
  }

  /** AI 턴 실행 (자동) */
  async executeAITurn(): Promise<void> {
    // AI 윷 던지기 (약간의 딜레이로 자연스러움)
    await this.delay(800);

    const gaugeZone = this.aiPlayer.simulateGauge();
    const result = this.generateYutResult(gaugeZone);
    this.state.lastYutResult = result;
    if (result === 'yut' || result === 'mo') {
      this.state.extraTurns++;
    }
    this.onStateChange({ ...this.state });

    await this.delay(600);

    // AI 말 선택
    const moveAmount = this.getMoveAmount(result);
    const decision = this.aiPlayer.decideMalMove(
      this.state.players[1].mals,
      this.state.players[0].mals,
      moveAmount,
      this.pathCalculator
    );

    this.executeMalMove(1, decision.malIndex, decision.useShortcut);
    this.checkWinAndAdvance();
  }

  private generateYutResult(gaugeZone: GaugeZone): YutResultType {
    // @yut/shared의 확률 테이블 사용 (YutEngine과 동일 로직)
    // ...
    return 'do'; // placeholder
  }

  private executeMalMove(playerIndex: number, malIndex: number, useShortcut?: boolean) {
    // PathCalculator로 경로 계산 → 잡기/업기/골인 판정
    // 상태 업데이트 후 onStateChange 호출
    this.onStateChange({ ...this.state });
  }

  private checkWinAndAdvance() {
    // 승리 체크
    // 추가 턴 or 턴 교체
    // AI 턴이면 executeAITurn 호출
  }

  private getMoveAmount(result: YutResultType): number {
    const map: Record<string, number> = { do: 1, gae: 2, geol: 3, yut: 4, mo: 5, backdo: -1 };
    return map[result] ?? 0;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### 6.2 AI 전략 — 쉬움 (RandomStrategy)

```typescript
// src/ai/strategies/RandomStrategy.ts
import type { PathCalculator } from '@yut/shared';

interface MalInfo {
  position: number;
  isStacked: boolean;
  stackedWith: number[];
  isOnShortcut: boolean;
}

export class RandomStrategy {
  decideMalMove(
    myMals: MalInfo[],
    opponentMals: MalInfo[],
    moveAmount: number,
    pathCalculator: PathCalculator
  ): { malIndex: number; useShortcut: boolean } {
    // 이동 가능한 말 중 랜덤 선택
    const movable = myMals
      .map((mal, i) => ({ mal, index: i }))
      .filter(({ mal }) => {
        if (mal.position === 30) return false; // 골인 완료
        if (mal.position === -1 && moveAmount < 0) return false; // 대기 중 + 백도
        return true;
      });

    if (movable.length === 0) return { malIndex: 0, useShortcut: false };

    const chosen = movable[Math.floor(Math.random() * movable.length)];
    const useShortcut = Math.random() < 0.5; // 랜덤
    return { malIndex: chosen.index, useShortcut };
  }

  simulateGauge(): 'perfect' | 'good' | 'normal' | 'bad' {
    // 쉬운 AI: 대부분 normal~bad
    const r = Math.random();
    if (r < 0.05) return 'perfect';
    if (r < 0.2) return 'good';
    if (r < 0.6) return 'normal';
    return 'bad';
  }
}
```

### 6.3 AI 전략 — 보통 (HeuristicStrategy)

```typescript
// src/ai/strategies/HeuristicStrategy.ts
import type { PathCalculator } from '@yut/shared';

export class HeuristicStrategy {
  decideMalMove(
    myMals: MalInfo[],
    opponentMals: MalInfo[],
    moveAmount: number,
    pathCalculator: PathCalculator
  ): { malIndex: number; useShortcut: boolean } {
    const candidates = this.getMovableMals(myMals, moveAmount);
    if (candidates.length === 0) return { malIndex: 0, useShortcut: false };

    // 우선순위 스코어링
    let bestScore = -Infinity;
    let bestMove = { malIndex: candidates[0].index, useShortcut: false };

    for (const { mal, index } of candidates) {
      for (const useShortcut of [true, false]) {
        const path = pathCalculator.calculate(mal.position, moveAmount, mal.isOnShortcut);
        const targetPos = useShortcut && path.shortcutPath
          ? path.shortcutPath[path.shortcutPath.length - 1]
          : path.targetPosition;

        let score = 0;

        // 1순위: 잡기 가능 (+100)
        if (this.canCatch(targetPos, opponentMals)) {
          score += 100;
          // 업힌 적 말 잡기 보너스 (더 가치 높음)
          const stackedCount = this.countStackedAt(targetPos, opponentMals);
          score += stackedCount * 30;
        }

        // 2순위: 골인 가능 (+80)
        if (targetPos === 30) {
          score += 80;
        }

        // 3순위: 업기 가능 (+40)
        if (this.canStack(targetPos, myMals, index)) {
          score += 40;
        }

        // 4순위: 지름길 사용 (골인 빨라짐, +20)
        if (useShortcut && path.requiresPathChoice) {
          score += 20;
        }

        // 5순위: 안전 (적 말에게 잡힐 위험 낮음, +10)
        if (!this.isVulnerable(targetPos, opponentMals)) {
          score += 10;
        }

        // 6순위: 진행도 (골인에 가까울수록 가산)
        score += (targetPos / 30) * 5;

        if (score > bestScore) {
          bestScore = score;
          bestMove = { malIndex: index, useShortcut };
        }
      }
    }

    return bestMove;
  }

  simulateGauge(): 'perfect' | 'good' | 'normal' | 'bad' {
    const r = Math.random();
    if (r < 0.15) return 'perfect';
    if (r < 0.45) return 'good';
    if (r < 0.85) return 'normal';
    return 'bad';
  }

  private getMovableMals(mals: MalInfo[], moveAmount: number) {
    return mals
      .map((mal, index) => ({ mal, index }))
      .filter(({ mal }) => {
        if (mal.position === 30) return false;
        if (mal.position === -1 && moveAmount < 0) return false;
        return true;
      });
  }

  private canCatch(targetPos: number, opponentMals: MalInfo[]): boolean {
    return opponentMals.some((m) => m.position === targetPos && targetPos >= 0 && targetPos < 30);
  }

  private countStackedAt(targetPos: number, opponentMals: MalInfo[]): number {
    return opponentMals.filter((m) => m.position === targetPos && targetPos >= 0).length;
  }

  private canStack(targetPos: number, myMals: MalInfo[], excludeIndex: number): boolean {
    return myMals.some((m, i) => i !== excludeIndex && m.position === targetPos && targetPos >= 0 && targetPos < 30);
  }

  private isVulnerable(targetPos: number, opponentMals: MalInfo[]): boolean {
    // 단순 근접 체크: 적 말이 1~5칸 뒤에 있으면 위험
    for (const opp of opponentMals) {
      if (opp.position < 0 || opp.position >= 30) continue;
      const diff = targetPos - opp.position;
      if (diff > 0 && diff <= 5) return true;
    }
    return false;
  }
}
```

### 6.4 AI 전략 — 어려움 (MinimaxStrategy)

```typescript
// src/ai/strategies/MinimaxStrategy.ts
import { YUT_PROBABILITIES } from '@yut/shared';
import type { PathCalculator } from '@yut/shared';

export class MinimaxStrategy {
  private readonly MAX_DEPTH = 3; // 깊이 3으로 제한 (성능)
  private pathCalculator: PathCalculator;

  constructor() {
    this.pathCalculator = new PathCalculator();
  }

  decideMalMove(
    myMals: MalInfo[],
    opponentMals: MalInfo[],
    moveAmount: number,
    pathCalculator: PathCalculator
  ): { malIndex: number; useShortcut: boolean } {
    this.pathCalculator = pathCalculator;

    let bestScore = -Infinity;
    let bestMove = { malIndex: 0, useShortcut: false };
    const candidates = this.getMovableMals(myMals, moveAmount);

    for (const { mal, index } of candidates) {
      for (const useShortcut of [true, false]) {
        // 시뮬레이션: 이 수를 두면 어떤 상태가 되는지
        const simulatedState = this.simulateMove(
          myMals, opponentMals, index, moveAmount, useShortcut
        );

        // Expectimax: 윷 결과의 확률 가중 평균으로 미래 가치 계산
        const score = this.expectimax(
          simulatedState.myMals,
          simulatedState.opponentMals,
          this.MAX_DEPTH,
          false // 다음은 상대 턴
        );

        if (score > bestScore) {
          bestScore = score;
          bestMove = { malIndex: index, useShortcut };
        }
      }
    }

    return bestMove;
  }

  /**
   * Expectimax 알고리즘 (Minimax + 확률 노드)
   * - 내 턴: maximize
   * - 상대 턴: minimize
   * - 윷 결과: 확률 가중 평균 (chance node)
   */
  private expectimax(
    myMals: MalInfo[],
    opponentMals: MalInfo[],
    depth: number,
    isMyTurn: boolean
  ): number {
    if (depth === 0) {
      return this.evaluate(myMals, opponentMals);
    }

    // 윷 결과 확률별 기대값 계산
    let expectedValue = 0;

    const results: [string, number, number][] = [
      ['do', 1, YUT_PROBABILITIES.do],
      ['gae', 2, YUT_PROBABILITIES.gae],
      ['geol', 3, YUT_PROBABILITIES.geol],
      ['yut', 4, YUT_PROBABILITIES.yut],
      ['mo', 5, YUT_PROBABILITIES.mo],
    ];

    for (const [_, moveAmount, probability] of results) {
      const activeMals = isMyTurn ? myMals : opponentMals;
      const candidates = this.getMovableMals(activeMals, moveAmount);

      if (candidates.length === 0) {
        expectedValue += probability * this.evaluate(myMals, opponentMals);
        continue;
      }

      if (isMyTurn) {
        // Maximize
        let maxVal = -Infinity;
        for (const { index } of candidates) {
          const sim = this.simulateMove(myMals, opponentMals, index, moveAmount, false);
          const val = this.expectimax(sim.myMals, sim.opponentMals, depth - 1, false);
          maxVal = Math.max(maxVal, val);
        }
        expectedValue += probability * maxVal;
      } else {
        // Minimize
        let minVal = Infinity;
        for (const { index } of candidates) {
          const sim = this.simulateMove(opponentMals, myMals, index, moveAmount, false);
          const val = this.expectimax(myMals, sim.myMals, depth - 1, true);
          minVal = Math.min(minVal, val);
        }
        expectedValue += probability * minVal;
      }
    }

    return expectedValue;
  }

  /**
   * 보드 평가 함수
   * 양수: AI 유리, 음수: 플레이어 유리
   */
  private evaluate(myMals: MalInfo[], opponentMals: MalInfo[]): number {
    let score = 0;

    // 내 말 진행도 (골인에 가까울수록 높음)
    for (const mal of myMals) {
      if (mal.position === 30) score += 100;       // 골인
      else if (mal.position === -1) score += 0;    // 대기
      else score += mal.position * 3;              // 진행도
    }

    // 상대 말 진행도 (반대)
    for (const mal of opponentMals) {
      if (mal.position === 30) score -= 100;
      else if (mal.position === -1) score -= 0;
      else score -= mal.position * 3;
    }

    // 업기 보너스 (내 말이 묶여 있으면 효율적)
    for (const mal of myMals) {
      if (mal.isStacked) score += 15 * mal.stackedWith.length;
    }

    // 잡기 위험 페널티 (적 말이 가까이 있으면)
    for (const myMal of myMals) {
      if (myMal.position < 0 || myMal.position >= 30) continue;
      for (const opp of opponentMals) {
        if (opp.position < 0 || opp.position >= 30) continue;
        const diff = myMal.position - opp.position;
        if (diff > 0 && diff <= 5) {
          score -= 10; // 잡힐 위험
          if (myMal.isStacked) score -= 20; // 업힌 상태로 잡히면 더 치명적
        }
      }
    }

    return score;
  }

  simulateGauge(): 'perfect' | 'good' | 'normal' | 'bad' {
    // 어려운 AI: 대부분 perfect~good
    const r = Math.random();
    if (r < 0.4) return 'perfect';
    if (r < 0.75) return 'good';
    if (r < 0.95) return 'normal';
    return 'bad';
  }

  private simulateMove(
    activeMals: MalInfo[],
    passiveMals: MalInfo[],
    malIndex: number,
    moveAmount: number,
    useShortcut: boolean
  ): { myMals: MalInfo[]; opponentMals: MalInfo[] } {
    // 깊은 복사 후 이동 시뮬레이션
    const newActive = JSON.parse(JSON.stringify(activeMals)) as MalInfo[];
    const newPassive = JSON.parse(JSON.stringify(passiveMals)) as MalInfo[];

    const mal = newActive[malIndex];
    const path = this.pathCalculator.calculate(mal.position, moveAmount, mal.isOnShortcut);
    mal.position = path.targetPosition;

    // 잡기 시뮬레이션
    for (const opp of newPassive) {
      if (opp.position === mal.position && mal.position >= 0 && mal.position < 30) {
        opp.position = -1;
        opp.isStacked = false;
        opp.stackedWith = [];
      }
    }

    return { myMals: newActive, opponentMals: newPassive };
  }

  private getMovableMals(mals: MalInfo[], moveAmount: number) {
    return mals
      .map((mal, index) => ({ mal, index }))
      .filter(({ mal }) => {
        if (mal.position === 30) return false;
        if (mal.position === -1 && moveAmount < 0) return false;
        return true;
      });
  }
}
```

---

## 7. Firebase 설계

### 7.1 Firestore 컬렉션/문서 구조

```
firestore/
├── users/{userId}                     # 유저 프로필
│   ├── uid: string
│   ├── nickname: string (unique)
│   ├── profileImage: string
│   ├── provider: "kakao" | "google" | "apple"
│   ├── rating: number (default: 1500)
│   ├── ratingDeviation: number (default: 350)
│   ├── volatility: number (default: 0.06)
│   ├── stats: {
│   │   totalGames, wins, losses, winStreak, maxWinStreak, disconnects
│   │ }
│   ├── subscription: { type, expiresAt, revenuecatId }
│   ├── characters: { unlocked: string[], equipped: string }
│   ├── penalties: { chatBanUntil, matchBanUntil, recentDisconnects }
│   ├── kakaoFriends: string[]         # 카카오 친구 userId 목록
│   ├── createdAt: Timestamp
│   └── lastActiveAt: Timestamp
│
├── nicknames/{nickname}               # 닉네임 유니크 인덱스
│   └── uid: string
│
├── gameRecords/{gameId}               # 게임 기록
│   ├── gameId: string
│   ├── mode: "1v1" | "2v2"
│   ├── players: [{ userId, team, ratingBefore, ratingAfter, isWinner }]
│   ├── turns: [{ turnNumber, playerId, yutResult, selectedMal, ... }]
│   ├── result: { winnerTeam, reason, duration }
│   ├── roomSettings: { turnTime, isRanked, gaugeMode }
│   ├── createdAt: Timestamp
│   └── serverSeed: string
│
├── leaderboards/monthly_{YYYY_MM}/    # 월간 리더보드
│   └── entries/{userId}
│       ├── userId: string
│       ├── nickname: string
│       ├── profileImage: string
│       ├── characterId: string
│       ├── monthlyWins: number
│       ├── totalGames: number
│       └── winRate: number
│
└── seasons/{seasonId}                 # 시즌 정보 (Phase 2)
    ├── seasonNumber, name, startDate, endDate
    └── rewards: { ... }
```

### 7.2 Security Rules

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 유저 프로필
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth.uid == userId;
      allow update: if request.auth.uid == userId
        && !request.resource.data.diff(resource.data).affectedKeys()
           .hasAny(['rating', 'ratingDeviation', 'volatility', 'penalties', 'stats']);
      // rating, stats, penalties는 서버 (Admin SDK)에서만 변경 가능
    }

    // 닉네임 유니크 인덱스
    match /nicknames/{nickname} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.uid == request.auth.uid;
      allow delete: if request.auth != null
        && resource.data.uid == request.auth.uid;
    }

    // 게임 기록: 읽기는 참여자만, 쓰기는 서버만
    match /gameRecords/{gameId} {
      allow read: if request.auth != null
        && request.auth.uid in resource.data.players.map(p => p.userId);
      allow write: if false; // Admin SDK only
    }

    // 리더보드: 읽기는 인증 유저, 쓰기는 서버만
    match /leaderboards/{boardId}/entries/{userId} {
      allow read: if request.auth != null;
      allow write: if false; // Admin SDK only
    }
  }
}
```

### 7.3 Firebase Auth (카카오 커스텀 토큰 플로우)

```typescript
// apps/server/src/auth/kakaoAuth.ts
import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import fetch from 'node-fetch';

/**
 * 카카오 로그인 → Firebase Custom Token 발급
 *
 * 플로우:
 * 1. 클라이언트가 카카오 SDK로 카카오 액세스 토큰 획득
 * 2. 클라이언트가 카카오 토큰을 이 엔드포인트로 전송
 * 3. 서버가 카카오 API로 토큰 검증 + 유저 정보 획득
 * 4. Firebase Custom Token 발급하여 클라이언트에 반환
 * 5. 클라이언트가 signInWithCustomToken()으로 Firebase 인증 완료
 */
export async function handleKakaoAuth(req: Request, res: Response) {
  try {
    const { kakaoAccessToken } = req.body;
    if (!kakaoAccessToken) {
      return res.status(400).json({ error: 'kakaoAccessToken required' });
    }

    // 카카오 API로 유저 정보 조회
    const kakaoResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${kakaoAccessToken}` },
    });

    if (!kakaoResponse.ok) {
      return res.status(401).json({ error: 'Invalid kakao token' });
    }

    const kakaoUser = await kakaoResponse.json() as any;
    const kakaoId = String(kakaoUser.id);
    const firebaseUid = `kakao:${kakaoId}`;

    // Firebase 유저 존재 확인 or 생성
    try {
      await admin.auth().getUser(firebaseUid);
    } catch {
      await admin.auth().createUser({
        uid: firebaseUid,
        displayName: kakaoUser.kakao_account?.profile?.nickname ?? 'Player',
        photoURL: kakaoUser.kakao_account?.profile?.thumbnail_image_url ?? null,
      });
    }

    // Firebase Custom Token 발급
    const customToken = await admin.auth().createCustomToken(firebaseUid, {
      provider: 'kakao',
      kakaoId,
    });

    return res.json({ customToken, uid: firebaseUid });
  } catch (error) {
    console.error('Kakao auth error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

### 7.4 Cloud Functions 목록

Firebase Cloud Functions는 최소한으로 유지. Colyseus 서버가 대부분의 로직을 처리.

| Function | 트리거 | 용도 |
|----------|--------|------|
| `onUserCreate` | Auth onCreate | Firestore에 초기 유저 문서 생성, 기본 캐릭터 해금 |
| `resetMonthlyLeaderboard` | Scheduled (매월 1일 00:00 KST) | 리더보드 컬렉션 초기화, 이전 월 아카이브 |
| `syncSubscriptionStatus` | RevenueCat Webhook | 구독 상태 변경 시 Firestore 업데이트 |

```typescript
// Cloud Functions 예시 (firebase/functions/src/index.ts)
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// 유저 생성 시 초기 프로필 문서 생성
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  const defaultCharacters = ['stone', 'wood', 'acorn', 'chestnut'];

  await admin.firestore().collection('users').doc(user.uid).set({
    uid: user.uid,
    nickname: '', // 프로필 설정에서 입력
    profileImage: user.photoURL ?? '',
    provider: user.providerData[0]?.providerId ?? 'unknown',
    rating: 1500,
    ratingDeviation: 350,
    volatility: 0.06,
    stats: {
      totalGames: 0,
      wins: 0,
      losses: 0,
      winStreak: 0,
      maxWinStreak: 0,
      disconnects: 0,
    },
    subscription: {
      type: 'none',
      expiresAt: null,
      revenuecatId: '',
    },
    characters: {
      unlocked: defaultCharacters,
      equipped: 'stone',
    },
    penalties: {
      chatBanUntil: null,
      matchBanUntil: null,
      recentDisconnects: 0,
    },
    kakaoFriends: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});

// 월간 리더보드 리셋 (매월 1일)
export const resetMonthlyLeaderboard = functions.pubsub
  .schedule('0 0 1 * *')
  .timeZone('Asia/Seoul')
  .onRun(async () => {
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevBoardId = `monthly_${prevMonth.getFullYear()}_${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
    const newBoardId = `monthly_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 이전 월 리더보드는 아카이브로 보존 (자동 — 별도 삭제 안 함)
    // 새 월 리더보드 컬렉션은 게임 종료 시 자동 생성되므로 별도 초기화 불필요

    console.log(`Leaderboard reset: ${prevBoardId} → ${newBoardId}`);
    return null;
  });
```

---

## 8. 렌더링 & 애니메이션 설계

### 8.1 react-native-skia: 윷판 렌더링

```typescript
// src/components/game/Board.tsx
import React, { useMemo } from 'react';
import { Canvas, Path, Circle, Group, Image, useImage, Skia, RoundedRect } from '@shopify/react-native-skia';
import { useWindowDimensions } from 'react-native';
import { boardGraph } from '@yut/shared';
import { BoardNode } from './BoardNode';
import { Mal } from './Mal';
import { MovePreview } from './MovePreview';
import { useGameStore } from '@/stores/gameStore';

const BOARD_PADDING = 20;

export function Board() {
  const { width: screenWidth } = useWindowDimensions();
  const boardSize = screenWidth - BOARD_PADDING * 2;

  const nodes = useMemo(() => boardGraph.getAllNodes(), []);
  const players = useGameStore((s) => s.players);
  const availableMoves = useGameStore((s) => s.availableMoves);
  const selectedMalIndex = useGameStore((s) => s.selectedMalIndex);

  // 윷판 배경 텍스처 (한지)
  const backgroundImage = useImage(require('@/assets/images/board-bg.png'));

  return (
    <Canvas style={{ width: boardSize, height: boardSize }}>
      {/* 배경 (한지 텍스처) */}
      {backgroundImage && (
        <Image
          image={backgroundImage}
          x={0}
          y={0}
          width={boardSize}
          height={boardSize}
          fit="cover"
        />
      )}

      {/* 윷판 선 (외곽 + 대각선) */}
      <Group>
        {/* 외곽 사각형 */}
        <Path
          path={createOuterPath(boardSize)}
          color="#8B7355"
          style="stroke"
          strokeWidth={3}
        />
        {/* 대각선 (지름길) */}
        <Path
          path={createDiagonalPaths(boardSize)}
          color="#8B7355"
          style="stroke"
          strokeWidth={2}
          strokeCap="round"
        />
      </Group>

      {/* 노드 (칸) */}
      {nodes.map((node) => (
        <BoardNode
          key={node.id}
          node={node}
          boardSize={boardSize}
          isHighlighted={availableMoves.some((m) => m.targetPosition === node.id)}
        />
      ))}

      {/* 이동 가능 경로 프리뷰 */}
      {selectedMalIndex !== null && (
        <MovePreview
          moves={availableMoves.filter((m) => m.malIndex === selectedMalIndex)}
          boardSize={boardSize}
        />
      )}

      {/* 말 렌더링 */}
      {players.map((player, playerIdx) =>
        player.mals
          .filter((mal) => mal.position >= 0 && mal.position < 30)
          .map((mal) => (
            <Mal
              key={`${playerIdx}-${mal.index}`}
              position={mal.position}
              playerIndex={playerIdx}
              characterId={player.characterId}
              isStacked={mal.isStacked}
              stackCount={mal.stackedWith.length + 1}
              boardSize={boardSize}
            />
          ))
      )}
    </Canvas>
  );
}

function createOuterPath(size: number): string {
  const p = size * 0.1; // 패딩
  const s = size - p * 2;
  return `M ${p} ${p + s} L ${p + s} ${p + s} L ${p + s} ${p} L ${p} ${p} Z`;
}

function createDiagonalPaths(size: number): string {
  const p = size * 0.1;
  const s = size - p * 2;
  const center = p + s / 2;
  // 4개 대각선
  return [
    `M ${p} ${p + s} L ${center} ${center}`,          // 좌하 → 중앙
    `M ${p + s} ${p + s} L ${center} ${center}`,      // 우하 → 중앙
    `M ${p + s} ${p} L ${center} ${center}`,          // 우상 → 중앙
    `M ${p} ${p} L ${center} ${center}`,              // 좌상 → 중앙
  ].join(' ');
}
```

```typescript
// src/components/game/BoardNode.tsx
import React from 'react';
import { Circle, Group, Text, useFont } from '@shopify/react-native-skia';
import type { BoardNode as BoardNodeType } from '@yut/shared';

interface Props {
  node: BoardNodeType;
  boardSize: number;
  isHighlighted: boolean;
}

export function BoardNode({ node, boardSize, isHighlighted }: Props) {
  const padding = boardSize * 0.1;
  const innerSize = boardSize - padding * 2;

  const cx = padding + node.x * innerSize;
  const cy = padding + node.y * innerSize;

  const radius = node.isCorner || node.isCenter ? 14 : 10;
  const fillColor = isHighlighted ? '#FFD700' : node.isCorner ? '#D4A574' : '#C4A882';
  const strokeColor = '#8B7355';

  return (
    <Group>
      <Circle
        cx={cx}
        cy={cy}
        r={radius}
        color={fillColor}
      />
      <Circle
        cx={cx}
        cy={cy}
        r={radius}
        color={strokeColor}
        style="stroke"
        strokeWidth={2}
      />
    </Group>
  );
}
```

### 8.2 rive-react-native: 윷 던지기 State Machine

Rive 파일 (`yut-throw.riv`) State Machine 설계:

```
State Machine: "YutThrowSM"

Inputs:
  - throwTrigger (Trigger)       # 던지기 시작
  - resultType (Number)          # 결과: 1=do, 2=gae, 3=geol, 4=yut, 5=mo, 6=backdo
  - gaugeZone (Number)           # 게이지: 0=bad, 1=normal, 2=good, 3=perfect

States:
  [Idle]
    → throwTrigger → [WindUp]

  [WindUp] (0.3s)
    # 손이 뒤로 당기는 동작
    → auto → [Throw]

  [Throw] (0.5s)
    # 윷짝 4개가 공중으로 날아감
    # gaugeZone에 따라 던지기 세기/이펙트 차등
    → auto → [AirSpin]

  [AirSpin] (0.5s)
    # 윷짝이 공중에서 회전
    → auto → [Landing_{resultType}]

  [Landing_Do] (0.3s)
    # 1개 뒤집힘 (볼록) + 3개 엎어짐 (평)
    → auto → [Result]

  [Landing_Gae] (0.3s)
    # 2개 뒤집힘 + 2개 엎어짐
    → auto → [Result]

  [Landing_Geol] (0.3s)
    # 3개 뒤집힘 + 1개 엎어짐
    → auto → [Result]

  [Landing_Yut] (0.3s)
    # 4개 모두 뒤집힘 (볼록)
    → auto → [Result_Special]

  [Landing_Mo] (0.3s)
    # 4개 모두 엎어짐 (평)
    → auto → [Result_Special]

  [Landing_Backdo] (0.3s)
    # 1개만 특수 면 뒤집힘
    → auto → [Result]

  [Result] (0.5s)
    # 결과 텍스트 표시 + 바운스
    → auto → [Idle]

  [Result_Special] (0.8s)
    # 윷/모 특수 이펙트 (빛나는 효과 + 큰 텍스트)
    → auto → [Idle]
```

```typescript
// src/components/game/YutThrow.tsx
import React, { useRef, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Rive, { RiveRef, Fit } from 'rive-react-native';
import { useGameStore } from '@/stores/gameStore';

const YUT_RESULT_MAP: Record<string, number> = {
  do: 1, gae: 2, geol: 3, yut: 4, mo: 5, backdo: 6,
};

const GAUGE_ZONE_MAP: Record<string, number> = {
  bad: 0, normal: 1, good: 2, perfect: 3,
};

export function YutThrow() {
  const riveRef = useRef<RiveRef>(null);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const lastYutResult = useGameStore((s) => s.lastYutResult);
  const lastGaugeZone = useGameStore((s) => s.lastGaugeZone);

  const playThrowAnimation = useCallback((result: string, gaugeZone: string) => {
    if (!riveRef.current) return;

    // 결과/게이지 입력 설정
    riveRef.current.setInputState('YutThrowSM', 'resultType', YUT_RESULT_MAP[result] ?? 1);
    riveRef.current.setInputState('YutThrowSM', 'gaugeZone', GAUGE_ZONE_MAP[gaugeZone] ?? 1);

    // 던지기 트리거
    riveRef.current.fireState('YutThrowSM', 'throwTrigger');
  }, []);

  // 서버에서 윷 결과 수신 시 애니메이션 재생
  React.useEffect(() => {
    if (lastYutResult) {
      playThrowAnimation(lastYutResult, lastGaugeZone ?? 'normal');
    }
  }, [lastYutResult, lastGaugeZone]);

  return (
    <View style={styles.container}>
      <Rive
        ref={riveRef}
        resourceName="yut-throw"
        stateMachineName="YutThrowSM"
        fit={Fit.Contain}
        style={styles.rive}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: 200, alignItems: 'center' },
  rive: { width: 300, height: 200 },
});
```

### 8.3 react-native-reanimated: 말 이동 애니메이션

```typescript
// src/components/game/Mal.tsx
import React from 'react';
import { Group, Circle, Image, useImage } from '@shopify/react-native-skia';
import {
  useSharedValue,
  withSequence,
  withTiming,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import { boardGraph } from '@yut/shared';

interface Props {
  position: number;
  playerIndex: number;
  characterId: string;
  isStacked: boolean;
  stackCount: number;
  boardSize: number;
}

const PLAYER_COLORS = ['#E74C3C', '#3498DB', '#2ECC71', '#F1C40F'];

export function Mal({ position, playerIndex, characterId, isStacked, stackCount, boardSize }: Props) {
  const node = boardGraph.getNode(position);
  if (!node) return null;

  const padding = boardSize * 0.1;
  const innerSize = boardSize - padding * 2;
  const targetX = padding + node.x * innerSize;
  const targetY = padding + node.y * innerSize;

  // 애니메이션 값
  const animatedX = useSharedValue(targetX);
  const animatedY = useSharedValue(targetY);
  const scale = useSharedValue(1);

  // 위치 변경 시 홉 애니메이션
  React.useEffect(() => {
    // 포물선 홉: X는 직선, Y는 위로 갔다 내려옴
    animatedX.value = withTiming(targetX, { duration: 200, easing: Easing.inOut(Easing.ease) });
    animatedY.value = withSequence(
      withTiming(targetY - 20, { duration: 100, easing: Easing.out(Easing.ease) }), // 위로 홉
      withTiming(targetY, { duration: 100, easing: Easing.in(Easing.ease) })         // 착지
    );
    // 스쿼시 & 스트레치
    scale.value = withSequence(
      withTiming(1.2, { duration: 50 }),  // 착지 전 늘어남
      withTiming(0.85, { duration: 50 }), // 착지 시 눌림
      withTiming(1.0, { duration: 80 })   // 복원
    );
  }, [position, targetX, targetY]);

  const color = PLAYER_COLORS[playerIndex] ?? '#888';
  const radius = isStacked ? 16 : 12;

  // Skia-Reanimated worklet 통합: .value를 JSX에서 직접 읽지 않고 useDerivedValue로 래핑
  const transform = useDerivedValue(() => {
    return [{ translateX: animatedX.value }, { translateY: animatedY.value }, { scaleY: scale.value }];
  });

  return (
    <Group transform={transform}>
      {/* 말 본체 */}
      <Circle cx={0} cy={0} r={radius} color={color} />
      <Circle cx={0} cy={0} r={radius} color="#000" style="stroke" strokeWidth={1.5} />

      {/* 업기 표시: 스택 카운트 */}
      {stackCount > 1 && (
        <Circle cx={radius - 4} cy={-radius + 4} r={8} color="#FFF" />
        // 숫자 텍스트는 Skia Text로 렌더링
      )}
    </Group>
  );
}
```

### 8.4 애니메이션 큐 시스템

```typescript
// src/hooks/useAnimation.ts
import { useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';
import type { AnimationEvent } from '@/stores/gameStore';

/**
 * 애니메이션 큐 관리 훅
 *
 * 서버에서 여러 상태 변경이 빠르게 연속될 수 있음 (예: 잡기 → 추가 턴 → 윷 결과)
 * 각 변경을 큐에 넣고 순차적으로 애니메이션 재생
 */
export function useAnimationQueue() {
  const queue = useGameStore((s) => s.animationQueue);
  const isAnimating = useGameStore((s) => s.isAnimating);
  const dequeue = useGameStore((s) => s.dequeueAnimation);
  const setAnimating = useGameStore((s) => s.setAnimating);
  const processingRef = useRef(false);
  // useRef로 최신 큐 참조 유지 — 클로저 캡처로 인한 stale 참조 방지
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;
    processingRef.current = true;
    setAnimating(true);

    const event = queueRef.current[0];

    // 이벤트 유형별 애니메이션 실행
    await playAnimation(event);

    dequeue();
    processingRef.current = false;

    // 최신 큐 참조로 남은 항목 확인 (stale closure 방지)
    if (queueRef.current.length > 1) {
      // 다음 틱에서 처리 (React 렌더링 사이클 존중)
      setTimeout(() => processQueue(), 50);
    } else {
      setAnimating(false);
    }
  }, [dequeue, setAnimating]); // queue 의존성 제거 — queueRef로 최신 값 참조

  useEffect(() => {
    if (queue.length > 0 && !isAnimating) {
      processQueue();
    }
  }, [queue.length, isAnimating, processQueue]);
}

async function playAnimation(event: AnimationEvent): Promise<void> {
  switch (event.type) {
    case 'yut_throw':
      // Rive 애니메이션 재생 + 대기 (~2초)
      return new Promise((resolve) => setTimeout(resolve, 2000));

    case 'mal_move':
      // 경유 칸 수 x 200ms
      const duration = event.path.length * 200;
      return new Promise((resolve) => setTimeout(resolve, duration));

    case 'mal_catch':
      // 잡기 이펙트 (Lottie) + 햅틱 + 사운드 (~800ms)
      return new Promise((resolve) => setTimeout(resolve, 800));

    case 'mal_stack':
      // 업기 애니메이션 (~400ms)
      return new Promise((resolve) => setTimeout(resolve, 400));

    case 'mal_goal':
      // 골인 이펙트 (~600ms)
      return new Promise((resolve) => setTimeout(resolve, 600));

    case 'game_over':
      // 승리/패배 오버레이 (Lottie) — 유저 인터랙션까지 대기
      return new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
```

### 8.5 스킬 게이지 UI

```typescript
// src/components/game/SkillGauge.tsx
import React, { useCallback, useEffect, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface Props {
  isActive: boolean; // 내 턴일 때만 활성
  onThrow: (gaugeZone: 'perfect' | 'good' | 'normal' | 'bad') => void;
}

const GAUGE_WIDTH = 280;
const INDICATOR_SIZE = 16;
const CYCLE_DURATION = 1500; // 1.5초 주기

// 게이지 영역 정의 (0~1 정규화)
const ZONES = {
  BAD_LEFT: { start: 0, end: 0.1 },
  NORMAL_LEFT: { start: 0.1, end: 0.2 },
  GOOD_LEFT: { start: 0.2, end: 0.35 },
  PERFECT: { start: 0.35, end: 0.65 },
  GOOD_RIGHT: { start: 0.65, end: 0.8 },
  NORMAL_RIGHT: { start: 0.8, end: 0.9 },
  BAD_RIGHT: { start: 0.9, end: 1.0 },
};

export function SkillGauge({ isActive, onThrow }: Props) {
  const indicatorPosition = useSharedValue(0); // 0~1

  useEffect(() => {
    if (isActive) {
      // 좌우 왕복 애니메이션
      indicatorPosition.value = 0;
      indicatorPosition.value = withRepeat(
        withTiming(1, { duration: CYCLE_DURATION, easing: Easing.inOut(Easing.ease) }),
        -1, // 무한 반복
        true // reverse
      );
    } else {
      cancelAnimation(indicatorPosition);
    }
  }, [isActive]);

  const handlePress = useCallback(() => {
    // 인디케이터 정지
    cancelAnimation(indicatorPosition);
    const pos = indicatorPosition.value;

    // 게이지 영역 판정
    let zone: 'perfect' | 'good' | 'normal' | 'bad';
    if (pos >= ZONES.PERFECT.start && pos <= ZONES.PERFECT.end) {
      zone = 'perfect';
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (
      (pos >= ZONES.GOOD_LEFT.start && pos < ZONES.GOOD_LEFT.end) ||
      (pos > ZONES.GOOD_RIGHT.start && pos <= ZONES.GOOD_RIGHT.end)
    ) {
      zone = 'good';
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (
      (pos >= ZONES.NORMAL_LEFT.start && pos < ZONES.NORMAL_LEFT.end) ||
      (pos > ZONES.NORMAL_RIGHT.start && pos <= ZONES.NORMAL_RIGHT.end)
    ) {
      zone = 'normal';
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      zone = 'bad';
    }

    onThrow(zone);
  }, [onThrow]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorPosition.value * (GAUGE_WIDTH - INDICATOR_SIZE) }],
  }));

  return (
    <View style={styles.container}>
      {/* 게이지 바 배경 */}
      <View style={styles.gaugeBar}>
        <View style={[styles.zone, styles.badZone, { left: '0%', width: '10%' }]} />
        <View style={[styles.zone, styles.normalZone, { left: '10%', width: '10%' }]} />
        <View style={[styles.zone, styles.goodZone, { left: '20%', width: '15%' }]} />
        <View style={[styles.zone, styles.perfectZone, { left: '35%', width: '30%' }]} />
        <View style={[styles.zone, styles.goodZone, { left: '65%', width: '15%' }]} />
        <View style={[styles.zone, styles.normalZone, { left: '80%', width: '10%' }]} />
        <View style={[styles.zone, styles.badZone, { left: '90%', width: '10%' }]} />

        {/* 이동 인디케이터 */}
        <Animated.View style={[styles.indicator, indicatorStyle]} />
      </View>

      {/* 던지기 버튼 */}
      <TouchableOpacity
        style={[styles.throwButton, !isActive && styles.throwButtonDisabled]}
        onPress={handlePress}
        disabled={!isActive}
      >
        <Text style={styles.throwButtonText}>던지기!</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 12 },
  gaugeBar: {
    width: GAUGE_WIDTH,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0D5C7',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 2,
    borderColor: '#8B7355',
  },
  zone: { position: 'absolute', top: 0, bottom: 0 },
  badZone: { backgroundColor: '#E74C3C40' },
  normalZone: { backgroundColor: '#F1C40F40' },
  goodZone: { backgroundColor: '#2ECC7140' },
  perfectZone: { backgroundColor: '#3498DB60' },
  indicator: {
    position: 'absolute',
    top: 0,
    width: INDICATOR_SIZE,
    height: '100%',
    backgroundColor: '#E74C3C',
    borderRadius: INDICATOR_SIZE / 2,
  },
  throwButton: {
    marginTop: 12,
    backgroundColor: '#E74C3C',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 28,
  },
  throwButtonDisabled: { backgroundColor: '#CCC' },
  throwButtonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
});
```

---

## 9. 수익화 구현

### 9.1 AdMob 배너 통합

```typescript
// src/components/ui/BannerAd.tsx
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { ADS } from '@/constants/ads';

/**
 * 앱 전체 하단 고정 배너 광고
 * - 모든 화면에서 항상 표시 (Root Layout에서 렌더링)
 * - 구독자/평생이용권 보유 시 숨김
 * - SafeArea 하단 여백 고려
 */
export function BannerAdWrapper() {
  const insets = useSafeAreaInsets();
  const isSubscribed = useSubscriptionStore((s) => s.isActive);

  if (isSubscribed) return null;

  const adUnitId = __DEV__
    ? TestIds.BANNER
    : Platform.select({
        ios: ADS.BANNER_IOS,
        android: ADS.BANNER_ANDROID,
      }) ?? TestIds.BANNER;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: false,
        }}
        onAdFailedToLoad={(error) => {
          console.warn('Banner ad failed to load:', error);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F5E6D3', // 윷판 배경색과 조화
    alignItems: 'center',
  },
});
```

```typescript
// src/constants/ads.ts
export const ADS = {
  BANNER_IOS: 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY',     // 실제 AdMob 단위 ID
  BANNER_ANDROID: 'ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ',
} as const;
```

### 9.2 RevenueCat 통합

```typescript
// src/services/purchases.ts
import Purchases, {
  PurchasesOffering,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useCharacterStore } from '@/stores/characterStore';

const REVENUECAT_API_KEY_IOS = 'appl_XXXXXXXXXXXXXXXX';
const REVENUECAT_API_KEY_ANDROID = 'goog_XXXXXXXXXXXXXXXX';

// Entitlement ID
const ENTITLEMENT_AD_FREE = 'ad_free';          // 광고 제거 (구독 + 평생이용권)
const ENTITLEMENT_SUBSCRIBER = 'subscriber';     // 구독자 전용 (캐릭터 해금)

// 상품 ID
export const PRODUCT_IDS = {
  WEEKLY: 'yut_weekly_2900',        // 주간 구독 2,900원
  MONTHLY: 'yut_monthly_7900',      // 월간 구독 7,900원
  LIFETIME: 'yut_lifetime_29900',   // 평생이용권 29,900원
} as const;

export async function initPurchases(userId: string) {
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  const apiKey = Platform.select({
    ios: REVENUECAT_API_KEY_IOS,
    android: REVENUECAT_API_KEY_ANDROID,
  })!;

  Purchases.configure({ apiKey, appUserID: userId });

  // 초기 구독 상태 체크
  await syncSubscriptionStatus();
}

/**
 * RevenueCat에서 현재 구독 상태를 가져와 Store에 동기화
 */
export async function syncSubscriptionStatus(): Promise<void> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    applyCustomerInfo(customerInfo);
  } catch (error) {
    console.error('Failed to sync subscription:', error);
  }
}

function applyCustomerInfo(info: CustomerInfo) {
  const { setSubscription } = useSubscriptionStore.getState();
  const { setUnlockedIds } = useCharacterStore.getState();

  const adFreeEntitlement = info.entitlements.active[ENTITLEMENT_AD_FREE];
  const subscriberEntitlement = info.entitlements.active[ENTITLEMENT_SUBSCRIBER];

  if (adFreeEntitlement) {
    // 평생이용권 체크
    if (adFreeEntitlement.productIdentifier === PRODUCT_IDS.LIFETIME) {
      setSubscription('lifetime', null);
    } else if (adFreeEntitlement.productIdentifier === PRODUCT_IDS.WEEKLY) {
      setSubscription('weekly', new Date(adFreeEntitlement.expirationDate!).getTime());
    } else if (adFreeEntitlement.productIdentifier === PRODUCT_IDS.MONTHLY) {
      setSubscription('monthly', new Date(adFreeEntitlement.expirationDate!).getTime());
    }
  } else {
    setSubscription('none', null);
  }

  // 캐릭터 해금 동기화
  const baseCharacters = ['stone', 'wood', 'acorn', 'chestnut'];
  const subscriberCharacters = ['rabbit', 'tiger', 'dog', 'cat', 'scholar', 'princess', 'bear', 'fox'];

  if (subscriberEntitlement) {
    setUnlockedIds([...baseCharacters, ...subscriberCharacters]);
  } else {
    setUnlockedIds(baseCharacters);
  }
}

/**
 * 구매 실행
 */
export async function purchaseProduct(productId: string): Promise<boolean> {
  try {
    const offerings = await Purchases.getOfferings();
    const currentOffering = offerings.current;
    if (!currentOffering) throw new Error('No offerings available');

    const pkg = currentOffering.availablePackages.find(
      (p) => p.product.identifier === productId
    );
    if (!pkg) throw new Error(`Product ${productId} not found`);

    const { customerInfo } = await Purchases.purchasePackage(pkg);
    applyCustomerInfo(customerInfo);
    return true;
  } catch (error: any) {
    if (error.userCancelled) return false;
    throw error;
  }
}

/**
 * 구독 복원
 */
export async function restorePurchases(): Promise<void> {
  const customerInfo = await Purchases.restorePurchases();
  applyCustomerInfo(customerInfo);
}
```

### 9.3 구독 상점 화면

```typescript
// app/(subscription)/store.tsx — 구조 요약
// 화면 구성:
// 1. 현재 구독 상태 배지
// 2. 구독 상품 카드 3종 (주간/월간/평생)
//    - 각 카드: 상품명, 가격, 혜택 목록, 구매 버튼
//    - 평생이용권은 "인기" 배지 표시
// 3. 구독자 전용 캐릭터 미리보기 그리드 (8종)
// 4. 구독 복원 버튼 (하단)
// 5. 이용약관/개인정보처리방침 링크
```

---

## 10. 다국어 (i18n) 설계

### 10.1 라이브러리 설정

```typescript
// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ko from './ko.json';
import en from './en.json';
import ja from './ja.json';

const LANGUAGE_STORAGE_KEY = '@app_language';

// 디바이스 언어에서 지원 언어 매칭
function getDeviceLanguage(): string {
  const deviceLang = Localization.getLocales()[0]?.languageCode ?? 'ko';
  const supported = ['ko', 'en', 'ja'];
  return supported.includes(deviceLang) ? deviceLang : 'en';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
      ja: { translation: ja },
    },
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

// 저장된 언어 설정 복원
export async function restoreLanguage() {
  const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved && ['ko', 'en', 'ja'].includes(saved)) {
    await i18n.changeLanguage(saved);
  }
}

// 언어 변경 + 저장
export async function changeLanguage(lang: 'ko' | 'en' | 'ja') {
  await i18n.changeLanguage(lang);
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
}

export default i18n;
```

### 10.2 번역 파일 구조

```jsonc
// src/i18n/ko.json
{
  "common": {
    "confirm": "확인",
    "cancel": "취소",
    "close": "닫기",
    "retry": "다시 시도",
    "loading": "로딩 중...",
    "error": "오류가 발생했습니다"
  },
  "auth": {
    "login_title": "윷놀이",
    "login_subtitle": "쉽고, 빠르고, 공정한 모바일 윷놀이",
    "kakao_login": "카카오로 시작하기",
    "google_login": "구글로 시작하기",
    "apple_login": "Apple로 시작하기",
    "profile_setup_title": "프로필 설정",
    "nickname_placeholder": "닉네임 (2~10자)",
    "nickname_taken": "이미 사용 중인 닉네임입니다",
    "nickname_invalid": "2~10자의 한글, 영문, 숫자만 사용 가능합니다",
    "complete": "완료"
  },
  "lobby": {
    "title": "윷놀이",
    "mode_1v1": "1:1 대전",
    "mode_2v2": "2:2 팀전",
    "mode_ai": "AI 대전",
    "gauge_classic": "클래식",
    "gauge_skill": "스킬",
    "quick_match": "빠른 매칭",
    "create_room": "방 만들기",
    "join_room": "방 참여",
    "wins": "승수",
    "win_rate": "승률"
  },
  "game": {
    "my_turn": "내 차례!",
    "opponent_turn": "상대 차례",
    "throw": "던지기!",
    "select_mal": "이동할 말을 선택하세요",
    "shortcut_choice": "지름길로 갈까요?",
    "shortcut_yes": "지름길",
    "shortcut_no": "외곽",
    "extra_turn": "추가 턴!",
    "timeout_warning": "시간이 얼마 남지 않았어요!",
    "reconnecting": "재접속 중...",
    "opponent_reconnecting": "상대가 재접속 중입니다 ({{seconds}}초)",
    "auto_move": "자동 이동됩니다"
  },
  "yut_result": {
    "do": "도",
    "gae": "개",
    "geol": "걸",
    "yut": "윷!",
    "mo": "모!",
    "backdo": "백도"
  },
  "bubble": {
    "sorry": "미안해요",
    "nice": "잘했어요",
    "hurry": "빨리 주세요",
    "hello": "왔어요"
  },
  "result": {
    "victory": "승리!",
    "defeat": "패배",
    "surrender": "상대가 기권했습니다",
    "disconnect": "상대가 나갔습니다",
    "stats_change": "승수 변동",
    "play_again": "다시 하기",
    "to_lobby": "로비로"
  },
  "leaderboard": {
    "title": "리더보드",
    "global": "전체",
    "friends": "친구",
    "monthly_wins": "월간 승수",
    "rank": "순위",
    "no_data": "아직 데이터가 없습니다",
    "my_rank": "내 순위: {{rank}}위"
  },
  "profile": {
    "title": "프로필",
    "total_games": "총 대전",
    "wins": "승리",
    "losses": "패배",
    "win_streak": "현재 연승",
    "max_win_streak": "최고 연승",
    "character_select": "캐릭터 선택",
    "subscriber_only": "구독자 전용"
  },
  "settings": {
    "title": "설정",
    "sound": "사운드",
    "bgm": "배경음",
    "sfx": "효과음",
    "language": "언어",
    "notifications": "알림",
    "subscription": "구독 관리",
    "account": "계정",
    "logout": "로그아웃",
    "logout_confirm": "정말 로그아웃 하시겠습니까?",
    "version": "버전"
  },
  "subscription": {
    "title": "구독",
    "weekly": "주간 이용권",
    "monthly": "월간 이용권",
    "lifetime": "평생 이용권",
    "ad_free": "광고 제거",
    "extra_characters": "추가 캐릭터 8종",
    "restore": "구매 복원",
    "current_plan": "현재 이용권",
    "popular": "인기"
  },
  "matching": {
    "searching": "상대를 찾고 있습니다...",
    "elapsed": "경과 시간: {{seconds}}초",
    "cancel": "취소",
    "found": "상대를 찾았습니다!"
  },
  "room": {
    "create_title": "방 만들기",
    "join_title": "방 참여",
    "room_code": "방 코드",
    "code_placeholder": "6자리 코드 입력",
    "share_invite": "초대하기",
    "waiting": "대기 중... ({{current}}/{{max}})",
    "start": "게임 시작",
    "turn_time": "턴 시간"
  },
  "ai": {
    "title": "AI 대전",
    "difficulty": "난이도",
    "easy": "쉬움",
    "medium": "보통",
    "hard": "어려움",
    "start": "게임 시작"
  }
}
```

```jsonc
// src/i18n/en.json (핵심 부분)
{
  "common": {
    "confirm": "OK",
    "cancel": "Cancel",
    "close": "Close",
    "retry": "Retry",
    "loading": "Loading...",
    "error": "An error occurred"
  },
  "auth": {
    "login_title": "Yut Nori",
    "login_subtitle": "Easy, Fast, Fair Mobile Yut Nori",
    "kakao_login": "Continue with Kakao",
    "google_login": "Continue with Google",
    "apple_login": "Continue with Apple"
  },
  "yut_result": {
    "do": "Do (1)",
    "gae": "Gae (2)",
    "geol": "Geol (3)",
    "yut": "Yut! (4)",
    "mo": "Mo! (5)",
    "backdo": "Back-do (-1)"
  },
  "bubble": {
    "sorry": "Sorry",
    "nice": "Nice!",
    "hurry": "Hurry up",
    "hello": "Hi there"
  }
}
```

```jsonc
// src/i18n/ja.json (핵심 부분)
{
  "common": {
    "confirm": "確認",
    "cancel": "キャンセル"
  },
  "auth": {
    "login_title": "ユンノリ",
    "login_subtitle": "簡単、速い、公正なモバイルユンノリ"
  },
  "yut_result": {
    "do": "ド (1)",
    "gae": "ケ (2)",
    "geol": "コル (3)",
    "yut": "ユッ! (4)",
    "mo": "モ! (5)",
    "backdo": "ペクド (-1)"
  },
  "bubble": {
    "sorry": "ごめんなさい",
    "nice": "ナイス!",
    "hurry": "早くして",
    "hello": "来ました"
  }
}
```

### 10.3 동적 언어 전환

```typescript
// src/hooks/useLocale.ts
import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import { changeLanguage } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

export function useLocale() {
  const { t, i18n } = useTranslation();
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const switchLanguage = useCallback(async (lang: 'ko' | 'en' | 'ja') => {
    await changeLanguage(lang);
    setLanguage(lang);
  }, [setLanguage]);

  return {
    t,
    currentLanguage: i18n.language as 'ko' | 'en' | 'ja',
    switchLanguage,
  };
}
```

---

## 11. 친구 초대 & 딥링크

### 11.1 딥링크 스키마

```
# 앱 딥링크 (커스텀 스키마)
yut://room/{roomCode}          # 방 참여
yut://profile/{userId}         # 프로필 보기

# Universal Link (iOS) / App Link (Android)
https://yutnori.app/room/{roomCode}
https://yutnori.app/invite/{inviteCode}
```

### 11.2 딥링크 핸들러

```typescript
// src/services/deeplink.ts
import * as Linking from 'expo-linking';
import { router } from 'expo-router';

export function setupDeepLinks() {
  // 앱이 이미 실행 중일 때 딥링크 수신
  const subscription = Linking.addEventListener('url', ({ url }) => {
    handleDeepLink(url);
  });

  // 앱이 딥링크로 시작될 때
  Linking.getInitialURL().then((url) => {
    if (url) handleDeepLink(url);
  });

  return () => subscription.remove();
}

function handleDeepLink(url: string) {
  const parsed = Linking.parse(url);

  // yut://room/123456 또는 https://yutnori.app/room/123456
  if (parsed.path?.startsWith('room/')) {
    const roomCode = parsed.path.replace('room/', '');
    if (roomCode.length === 6) {
      router.push(`/(game)/room/${roomCode}`);
    }
  }
}
```

### 11.3 카카오톡 공유 템플릿

```typescript
// src/services/kakaoShare.ts
import { shareCustom } from '@react-native-seoul/kakao-login';

interface RoomInviteParams {
  roomCode: string;
  hostNickname: string;
  mode: '1v1' | '2v2';
  gaugeMode: 'classic' | 'skill';
}

/**
 * 카카오톡 친구에게 방 초대 메시지 전송
 *
 * 카카오 개발자 콘솔에서 메시지 템플릿 사전 등록 필요:
 * - 템플릿 ID: KAKAO_TEMPLATE_ROOM_INVITE
 * - 유형: 커스텀 (Custom)
 */
export async function shareRoomInvite(params: RoomInviteParams) {
  const { roomCode, hostNickname, mode, gaugeMode } = params;

  const modeText = mode === '1v1' ? '1:1 대전' : '2:2 팀전';
  const gaugeText = gaugeMode === 'classic' ? '클래식' : '스킬';

  try {
    await shareCustom({
      templateId: Number(process.env.EXPO_PUBLIC_KAKAO_TEMPLATE_ID),
      templateArgs: {
        room_code: roomCode,
        host_name: hostNickname,
        mode_text: `${modeText} (${gaugeText} 모드)`,
        deep_link: `yut://room/${roomCode}`,
        web_link: `https://yutnori.app/room/${roomCode}`,
      },
    });
  } catch (error) {
    console.error('Kakao share failed:', error);
    // 폴백: 시스템 공유 시트
    await systemShare(roomCode);
  }
}

async function systemShare(roomCode: string) {
  const { Share } = require('react-native');
  await Share.share({
    message: `윷놀이 한 판 하자! 방 코드: ${roomCode}\nhttps://yutnori.app/room/${roomCode}`,
  });
}
```

### 11.4 Universal Link / App Link 설정

```jsonc
// app.json (Expo)
{
  "expo": {
    "scheme": "yut",
    "ios": {
      "associatedDomains": ["applinks:yutnori.app"],
      "bundleIdentifier": "com.yutnori.app"
    },
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "yutnori.app",
              "pathPrefix": "/room"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ],
      "package": "com.yutnori.app"
    }
  }
}
```

```jsonc
// apple-app-site-association (yutnori.app/.well-known/)
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.yutnori.app",
        "paths": ["/room/*", "/invite/*"]
      }
    ]
  }
}
```

---

## 12. 이탈 방지 & 패널티 시스템

### 12.1 서버 측 감지 로직

```typescript
// apps/server/src/matchmaking/PenaltyChecker.ts
import { getRedisClient } from '../config/redis';
import { UserService } from '../services/UserService';

const DISCONNECT_COUNT_KEY = 'penalty:disconnect:';
const MATCH_BAN_KEY = 'penalty:matchban:';
const DISCONNECT_TTL = 86400; // 24시간

export class PenaltyChecker {
  private userService = new UserService();

  /**
   * 매칭 금지 상태 확인
   */
  async isMatchBanned(userId: string): Promise<boolean> {
    const redis = getRedisClient();
    const banUntil = await redis.get(`${MATCH_BAN_KEY}${userId}`);
    if (!banUntil) return false;
    return Date.now() < Number(banUntil);
  }

  /**
   * 이탈 기록 + 패널티 적용
   */
  async recordDisconnect(userId: string): Promise<void> {
    const redis = getRedisClient();
    const key = `${DISCONNECT_COUNT_KEY}${userId}`;

    // 24시간 내 이탈 횟수 증가
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, DISCONNECT_TTL);
    }

    // 단일 이탈: 5분 매칭 금지
    await redis.setex(
      `${MATCH_BAN_KEY}${userId}`,
      300, // 5분
      String(Date.now() + 300_000)
    );

    // 24시간 내 3회 이탈: 30분 매칭 금지 + 레이팅 -50
    if (count >= 3) {
      await redis.setex(
        `${MATCH_BAN_KEY}${userId}`,
        1800, // 30분
        String(Date.now() + 1800_000)
      );
      await this.userService.adjustRating(userId, -50);
    }

    // Firestore에 이탈 기록 업데이트
    await this.userService.incrementDisconnects(userId);

    // 7일 내 10회 상습 이탈 체크 (Firestore에서 확인)
    const user = await this.userService.getUser(userId);
    if (user && user.stats.disconnects >= 10) {
      // 24시간 매칭 금지
      await redis.setex(
        `${MATCH_BAN_KEY}${userId}`,
        86400,
        String(Date.now() + 86400_000)
      );
    }
  }

  /**
   * 3턴 연속 방치 감지는 YutGameRoom.handleTurnTimeout에서 처리
   * (consecutiveTimeouts >= 3 → endGame)
   */
}
```

### 12.2 Redis 키 설계

```
penalty:disconnect:{userId}    # 24시간 내 이탈 횟수 (TTL: 24h)
penalty:matchban:{userId}      # 매칭 금지 만료 시간 (TTL: 금지 기간)
matchmaking:queue:1v1:classic  # 1v1 클래식 매칭 큐 (Sorted Set, score=rating)
matchmaking:queue:1v1:skill    # 1v1 스킬 매칭 큐
matchmaking:queue:2v2:classic  # 2v2 클래식 매칭 큐
matchmaking:queue:2v2:skill    # 2v2 스킬 매칭 큐
room:code:{roomCode}           # 방 코드 → roomId 매핑 (TTL: 5m)
session:{userId}               # 유저 현재 세션/방 정보 (TTL: 게임 시간)
```

---

## 13. 테스트 전략

### 13.1 단위 테스트 (shared 패키지)

```typescript
// packages/shared/src/__tests__/PathCalculator.test.ts
import { PathCalculator } from '../board/PathCalculator';
import { NODE } from '../board/BoardConstants';

describe('PathCalculator', () => {
  const calc = new PathCalculator();

  describe('출발점에서 이동', () => {
    it('도(1칸): START → 0번 노드', () => {
      const result = calc.calculate(NODE.START, 1, false);
      expect(result.targetPosition).toBe(0);
      expect(result.path).toEqual([0]);
    });

    it('모(5칸): START → 4번 노드', () => {
      const result = calc.calculate(NODE.START, 5, false);
      expect(result.targetPosition).toBe(4);
      expect(result.path.length).toBe(5);
    });
  });

  describe('지름길', () => {
    it('5번(우하 모서리) 정확 도착 시 경로 선택 필요', () => {
      const result = calc.calculate(3, 2, false); // 3 → 4 → 5
      expect(result.targetPosition).toBe(5);
      expect(result.requiresPathChoice).toBe(true);
    });

    it('지름길 진입 후 중앙으로 이동', () => {
      const result = calc.calculate(20, 2, true); // 20 → 21 → 22(중앙)
      expect(result.targetPosition).toBe(22);
    });
  });

  describe('백도', () => {
    it('0번에서 백도: 대기 상태로', () => {
      const result = calc.calculate(0, -1, false);
      expect(result.targetPosition).toBe(NODE.START);
    });

    it('대기 중 말은 백도 불가', () => {
      const result = calc.calculate(NODE.START, -1, false);
      expect(result.targetPosition).toBe(NODE.START);
    });
  });

  describe('골인', () => {
    it('19번에서 도(1칸): 골인', () => {
      const result = calc.calculate(19, 1, false);
      expect(result.targetPosition).toBe(NODE.GOAL);
    });

    it('남은 칸수보다 크게 나와도 골인', () => {
      const result = calc.calculate(18, 5, false);
      expect(result.targetPosition).toBe(NODE.GOAL);
    });
  });
});
```

```typescript
// packages/shared/src/__tests__/YutProbability.test.ts
import { YUT_PROBABILITIES, GAUGE_MODIFIERS } from '../game/YutProbability';

describe('YutProbability', () => {
  it('기본 확률 합이 1.0', () => {
    const sum = Object.values(YUT_PROBABILITIES).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('PERFECT 보정 적용 시에도 합이 1.0 근사', () => {
    const modified = Object.entries(YUT_PROBABILITIES).map(
      ([key, base]) => base + (GAUGE_MODIFIERS.perfect[key] ?? 0)
    );
    const sum = modified.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });
});
```

```typescript
// packages/shared/src/__tests__/WinCondition.test.ts
import { WinCondition } from '../game/WinCondition';

describe('WinCondition', () => {
  it('4개 말 모두 골인 시 승리 (1v1)', () => {
    const players = [
      { team: 0, mals: [{ position: 30 }, { position: 30 }, { position: 30 }, { position: 30 }] },
      { team: 1, mals: [{ position: 5 }, { position: -1 }, { position: 10 }, { position: 3 }] },
    ];
    const result = WinCondition.check(players as any, '1v1');
    expect(result.isGameOver).toBe(true);
    expect(result.winnerTeam).toBe(0);
  });

  it('2v2에서 팀 4개 말 모두 골인 시 승리', () => {
    const players = [
      { team: 0, mals: [{ position: 30 }, { position: 30 }] },  // 팀0 플레이어1
      { team: 0, mals: [{ position: 30 }, { position: 30 }] },  // 팀0 플레이어2
      { team: 1, mals: [{ position: 5 }, { position: 10 }] },
      { team: 1, mals: [{ position: 3 }, { position: -1 }] },
    ];
    const result = WinCondition.check(players as any, '2v2');
    expect(result.isGameOver).toBe(true);
    expect(result.winnerTeam).toBe(0);
  });
});
```

### 13.2 통합 테스트 (Colyseus Room)

```typescript
// apps/server/src/__tests__/YutGameRoom.test.ts
import { ColyseusTestServer, boot } from '@colyseus/testing';
import { YutGameRoom } from '../rooms/YutGameRoom';

describe('YutGameRoom', () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    colyseus = await boot(ColyseusTestServer);
    colyseus.define('yut_game', YutGameRoom);
  });

  afterAll(async () => {
    await colyseus.shutdown();
  });

  it('2명 접속 시 게임 자동 시작', async () => {
    const room = await colyseus.createRoom('yut_game', {
      mode: '1v1',
      gaugeMode: 'classic',
    });

    const client1 = await colyseus.connectTo(room, { token: 'test-token-1' });
    const client2 = await colyseus.connectTo(room, { token: 'test-token-2' });

    await room.waitForNextPatch();

    expect(room.state.phase).toBe('playing');
    expect(room.state.players.length).toBe(2);
  });

  it('윷 던지기 → 서버에서 결과 생성', async () => {
    const room = await colyseus.createRoom('yut_game', {
      mode: '1v1',
      gaugeMode: 'classic',
    });

    const client1 = await colyseus.connectTo(room, { token: 'test-token-1' });
    const client2 = await colyseus.connectTo(room, { token: 'test-token-2' });
    await room.waitForNextPatch();

    // 현재 턴 플레이어가 윷 던지기
    const currentTurn = room.state.currentTurn;
    const currentClient = currentTurn === 0 ? client1 : client2;

    currentClient.send('throw_yut', {});
    await room.waitForNextPatch();

    const result = room.state.lastYutResult.result;
    expect(['do', 'gae', 'geol', 'yut', 'mo', 'backdo']).toContain(result);
    expect(room.state.turnPhase).toBe('move');
  });

  it('재접속 30초 내 복원', async () => {
    const room = await colyseus.createRoom('yut_game', {
      mode: '1v1',
      gaugeMode: 'classic',
    });

    const client1 = await colyseus.connectTo(room, { token: 'test-token-1' });
    const client2 = await colyseus.connectTo(room, { token: 'test-token-2' });
    await room.waitForNextPatch();

    // 클라이언트1 비자발적 연결 끊김
    client1.close();
    await room.waitForNextPatch();

    expect(room.state.players[0].isConnected).toBe(false);

    // 재접속
    const reconnected = await colyseus.connectTo(room, {
      token: 'test-token-1',
      reconnectionToken: client1.reconnectionToken,
    });
    await room.waitForNextPatch();

    expect(room.state.players[0].isConnected).toBe(true);
  });
});
```

### 13.3 E2E 테스트 (Maestro)

Maestro를 선택한 이유: React Native + Expo 환경에서 Detox보다 설정이 단순하고, YAML 기반으로 비개발자도 테스트 시나리오를 읽을 수 있음.

```yaml
# e2e/flows/login.yaml
appId: com.yutnori.app
---
- launchApp
- assertVisible: "윷놀이"              # 로그인 화면 타이틀
- assertVisible: "카카오로 시작하기"
- assertVisible: "구글로 시작하기"

# 구글 로그인 (테스트 계정)
- tapOn: "구글로 시작하기"
- waitForAnimationToEnd
- assertVisible: "프로필 설정"          # 신규 유저 → 프로필 설정
- inputText:
    text: "테스트유저"
    id: "nickname-input"
- tapOn: "완료"
- waitForAnimationToEnd
- assertVisible: "빠른 매칭"           # 로비 도달 확인
```

```yaml
# e2e/flows/ai-game.yaml
appId: com.yutnori.app
---
- launchApp
# 로그인 스킵 (테스트 빌드에서 자동 로그인)
- waitForAnimationToEnd

# AI 대전 시작
- tapOn: "AI 대전"
- assertVisible: "난이도"
- tapOn: "쉬움"
- tapOn: "게임 시작"

# 게임 화면 확인
- waitForAnimationToEnd
- assertVisible: "던지기!"

# 윷 던지기
- tapOn: "던지기!"
- waitForAnimationToEnd

# 말 선택 (아무 말이나)
- tapOn:
    point: "50%, 60%"                  # 보드 중앙 근처
- waitForAnimationToEnd

# 게임 루프 반복 (AI 턴 대기 포함)
- repeat:
    times: 20
    commands:
      - tapOn: "던지기!"
      - waitForAnimationToEnd:
          timeout: 5000
      - tapOn:
          point: "50%, 60%"
      - waitForAnimationToEnd:
          timeout: 5000

# 게임 종료 확인 (승리 또는 패배)
- assertVisible:
    anyOf:
      - "승리!"
      - "패배"
```

---

## 14. CI/CD & 배포

### 14.1 EAS Build / EAS Submit

```jsonc
// apps/mobile/eas.json
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      },
      "env": {
        "EXPO_PUBLIC_COLYSEUS_URL": "ws://localhost:2567",
        "EXPO_PUBLIC_ENV": "development"
      }
    },
    "preview": {
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_COLYSEUS_URL": "wss://yut-staging.up.railway.app",
        "EXPO_PUBLIC_ENV": "staging"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_COLYSEUS_URL": "wss://yut.up.railway.app",
        "EXPO_PUBLIC_ENV": "production"
      },
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "developer@yutnori.app",
        "ascAppId": "XXXXXXXXXX",
        "appleTeamId": "XXXXXXXXXX"
      },
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "production"
      }
    }
  }
}
```

### 14.2 Colyseus 서버 Railway 배포

```dockerfile
# apps/server/Dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN corepack enable && pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
COPY tsconfig.base.json ./

RUN pnpm --filter @yut/shared build
RUN pnpm --filter @yut/server build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@yut/shared/dist

EXPOSE 2567
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

Railway 설정:
- **서비스**: Colyseus 서버 (Docker 빌드)
- **리전**: 서울 (ap-northeast-2) — `railway.toml`에서 지정 불가, Railway 대시보드에서 설정
- **스케일링**: 초기 1 인스턴스, DAU 증가 시 수평 확장 검토
- **헬스 체크**: `GET /health`
- **환경 변수**: Railway 대시보드에서 관리

### 14.3 환경 변수 관리

```bash
# apps/server/.env.example
PORT=2567
NODE_ENV=development

# Firebase Admin
FIREBASE_PROJECT_ID=yut-nori-xxx
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@yut-nori-xxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Redis (Upstash)
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379

# Kakao
KAKAO_REST_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```bash
# apps/mobile/.env.example
EXPO_PUBLIC_COLYSEUS_URL=ws://localhost:2567
EXPO_PUBLIC_FIREBASE_API_KEY=xxx
EXPO_PUBLIC_FIREBASE_PROJECT_ID=yut-nori-xxx
EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY=xxx
EXPO_PUBLIC_KAKAO_TEMPLATE_ID=12345
EXPO_PUBLIC_ENV=development
```

### 14.4 GitHub Actions CI

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint typecheck

  test-shared:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @yut/shared test -- --coverage

  test-server:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @yut/shared build
      - run: pnpm --filter @yut/server test

  build-mobile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @yut/shared build
      - run: pnpm --filter @yut/mobile typecheck
```

---

## ADR (Architecture Decision Record)

### Decision: Colyseus + Firebase + Zustand + Skia 스택 채택

**Drivers**:
1. 20주 내 iOS/Android 동시 출시 (개발 속도 최우선)
2. 서버 권위 실시간 게임 로직 (치팅 방지, 공정성)
3. 오프라인 AI 대전 지원 (shared 패키지 로직 재사용)

**Alternatives Considered**:
- **Jotai 대신 Zustand**: Jotai의 원자적 모델은 Colyseus Room State 동기화와 구조적 불일치. Zustand의 단일 Store 미러링이 직관적.
- **SVG 대신 Skia**: SVG는 DOM 기반이라 윷판 30+ 노드 + 말 애니메이션에서 성능 저하. Skia는 GPU 가속으로 60fps 보장.
- **Serverless 대신 Colyseus**: Cloud Functions cold start + HTTP polling은 실시간 게임에 부적합. Colyseus의 WebSocket + delta sync가 sub-second 응답 보장.
- **인메모리 대신 Redis**: 서버 재시작 시 매칭 큐 보존, 이탈 카운터 TTL 자동 만료, 향후 멀티 서버 확장 대비.

**Why Chosen**:
- Colyseus의 Room/Schema/matchmaker 내장 기능이 게임 서버 코드를 최소화
- Firebase의 Auth + Firestore + Functions가 보조 서비스를 빠르게 구축
- shared 패키지로 서버/클라이언트/AI 간 로직 100% 공유, 불일치 원천 차단
- Zustand의 persist 미들웨어로 오프라인 상태 복원 간편

**Consequences**:
- (+) 타입 안전한 모노레포로 리팩토링 비용 최소화
- (+) Colyseus playground/monitor로 개발 중 디버깅 용이
- (-) Colyseus 동시 접속 5K+ 시 스케일링 작업 필요
- (-) Firestore 읽기 비용 관리 필요 (캐시 전략 의무화)

**Follow-ups**:
- DAU 5K 도달 시 Colyseus 클러스터링 계획 수립
- Firestore 비용 월 $100 초과 시 PostgreSQL 마이그레이션 검토
- react-native-skia 저사양 기기 (iPhone SE 2세대, Galaxy A시리즈) 프로파일링 Week 18에 수행
- Rive 파일 크기 200KB 제한 준수 여부 Week 5에 검증

---

> **문서 버전**: v1.0
> **작성일**: 2026-04-16
> **기반 문서**: `docs/GAME_PLAN.md` v1.0
> **상태**: 구현 설계 완료 — 개발 착수 가능
