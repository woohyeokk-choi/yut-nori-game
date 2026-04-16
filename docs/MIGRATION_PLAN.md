# 윷놀이 게임 마이그레이션 기획서

## Expo 유지 + Skia GPU 렌더링 하이브리드 전환

**작성일:** 2026-04-16
**최종 수정:** 2026-04-16
**상태:** Draft (Revised)
**접근 방식:** Expo SDK 52 유지, 렌더링만 SVG → Skia 교체

---

## 1. 현황 분석

### 1.1 현재 아키텍처

```
yut-nori-game/
├── apps/
│   ├── mobile/          ← Expo SDK 52 + expo-router 4
│   │   ├── app/         ← 파일 기반 라우팅 (6개 스크린)
│   │   │   ├── _layout.tsx      (RootLayout: Stack + SafeArea + AdBanner)
│   │   │   ├── index.tsx        (Lobby: 퀵매치/방만들기/AI대전)
│   │   │   ├── game.tsx         (Game: 윷판 + 게이지 + 채팅)
│   │   │   ├── settings.tsx     (Settings: 언어/사운드/게이지/구독)
│   │   │   ├── leaderboard.tsx  (Leaderboard: placeholder)
│   │   │   └── profile.tsx      (Profile: 캐릭터 선택)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── board/Board.tsx       (SVG 윷판 렌더링)
│   │   │   │   ├── board/SkillGauge.tsx  (Animated 게이지)
│   │   │   │   ├── board/ChatBubbles.tsx (빠른 채팅)
│   │   │   │   └── AdBanner.tsx          (광고 placeholder)
│   │   │   ├── stores/
│   │   │   │   ├── useGameStore.ts       (zustand)
│   │   │   │   ├── useSettingsStore.ts   (zustand)
│   │   │   │   ├── useSubscriptionStore.ts
│   │   │   │   └── useCharacterStore.ts
│   │   │   ├── services/gameClient.ts    (Colyseus 클라이언트)
│   │   │   └── i18n/                     (ko/en/ja)
│   │   ├── metro.config.js  (모노레포 설정)
│   │   ├── babel.config.js  (babel-preset-expo)
│   │   └── app.json         (Expo 설정)
│   └── server/              ← Colyseus 서버 (변경 없음)
├── packages/
│   └── shared/              ← 게임 로직 (변경 없음)
│       └── src/
│           ├── types/index.ts       (YutResult, MalState 등)
│           ├── board/BoardGraph.ts  (윷판 그래프 구조, 좌표)
│           ├── board/PathCalculator.ts (경로 계산)
│           └── game/YutProbability.ts  (윷 확률)
└── (turbo + pnpm 모노레포)
```

### 1.2 현재 의존성 (apps/mobile)

| 패키지 | 용도 | 마이그레이션 영향 |
|--------|------|-------------------|
| expo ~52.0.0 | 프레임워크 코어 | **유지** |
| expo-router ~4.0.0 | 파일 기반 라우팅 | **유지** |
| expo-constants ~17.0.0 | 앱 상수 | **유지** |
| expo-linking ~7.0.0 | 딥링크 | **유지** |
| expo-status-bar ~2.0.0 | 상태바 | **유지** |
| react-native-svg ^15.15.4 | 윷판 2D 렌더링 | **웹 전용 fallback으로 유지** |
| react-native 0.76.5 | RN 코어 | 유지 |
| react 18.3.1 | React 코어 | 유지 |
| react-dom 18.3.1 | 웹 렌더링 | **유지** (웹 빌드 보존) |
| react-native-web ~0.19.13 | 웹 지원 | **유지** (웹 빌드 보존) |
| react-native-safe-area-context 4.12.0 | Safe Area | 유지 |
| react-native-screens ~4.4.0 | 네이티브 스크린 | 유지 |
| colyseus.js 0.16 | 멀티플레이어 | 유지 |
| zustand ^5.0.12 | 상태 관리 | 유지 |
| nanoid ^5.1.9 | ID 생성 | 유지 |
| babel-preset-expo | Babel | **유지** |

### 1.3 변경 포인트 (렌더링 레이어만)

코드에서 실제 변경이 필요한 부분:

1. **Board.tsx** - SVG 렌더링 → Skia Canvas (네이티브) / SVG 유지 (웹), 플랫폼 분기
2. **SkillGauge.tsx** - `Animated` API → `react-native-reanimated` 전환
3. **ChatBubbles.tsx** - `Animated` API → `react-native-reanimated` 전환
4. **app.json** - Skia config plugin 추가
5. **babel.config.js** - Reanimated plugin 추가

**변경하지 않는 부분:**
- expo-router, 파일 기반 라우팅 구조 전체
- 네비게이션 (expo-router 그대로)
- 엔트리포인트 (`expo-router/entry`)
- Metro 설정 (`expo/metro-config`)
- 웹 빌드 (`expo start --web`)
- Stores, Services, i18n

---

## 2. RALPLAN-DR (의사결정 프레임워크)

### 2.1 Principles (원칙)

1. **네이티브 성능 우선**: GPU 가속 렌더링으로 윷판/말 애니메이션의 60fps 보장
2. **Expo 유지, 렌더링만 교체**: Expo SDK 52의 `npx expo prebuild` + config plugin 생태계를 활용하여 기존 인프라를 보존하고, 렌더링 레이어만 SVG → Skia로 전환
3. **공유 로직 보존**: `packages/shared`와 `apps/server`는 일체 변경하지 않음
4. **웹 호환성 유지**: 웹 플랫폼은 SVG fallback으로 기존 동작을 보존 (플랫폼 분기 파일)
5. **비즈니스 로직 분리**: 렌더링 레이어 교체가 게임 로직에 영향을 주지 않아야 함

### 2.2 Decision Drivers (핵심 결정 요인)

1. **렌더링 품질**: 현재 SVG 기반 정적 윷판 → 네이티브에서 GPU 가속으로 시각적 풍부함 (애니메이션, 파티클, 말 이동 효과)
2. **마이그레이션 리스크**: Expo 완전 제거는 네비게이션, 빌드 시스템, 웹 지원 등 전면 재작성이 필요. 하이브리드 접근은 렌더링 컴포넌트만 교체하므로 변경 범위가 최소화
3. **플랫폼 도달 범위**: 웹 빌드를 SVG fallback으로 유지하여 개발/테스트 편의와 웹 배포 가능성을 보존

### 2.3 Viable Options (실현 가능한 옵션)

#### Option A: Expo 유지 + Skia 하이브리드 (채택)

| 항목 | 내용 |
|------|------|
| **렌더링** | 네이티브: Skia GPU 가속 2D / 웹: SVG fallback |
| **애니메이션** | react-native-reanimated 3 (UI 스레드 애니메이션) |
| **네비게이션** | expo-router 4 (변경 없음) |
| **빌드** | `npx expo prebuild` → iOS/Android 네이티브 프로젝트 생성 |
| **웹 지원** | 유지 (`expo start --web` + SVG Board) |

**Pros (제한 3개):**
- `@shopify/react-native-skia`가 Expo config plugin을 공식 지원하여 `app.json`에 플러그인 추가만으로 네이티브 연동 완료
- expo-router, 웹 빌드, 기존 빌드 파이프라인을 모두 보존하여 마이그레이션 범위를 렌더링 컴포넌트 3개로 한정
- 플랫폼 분기 파일(`*.native.tsx` / `*.web.tsx`)로 네이티브 Skia와 웹 SVG를 깔끔하게 분리

**Cons (제한 3개):**
- 렌더링 코드가 네이티브(Skia)와 웹(SVG) 이중으로 존재하여 Board 컴포넌트 유지보수 비용 증가
- `npx expo prebuild`로 생성되는 `ios/`, `android/` 디렉토리를 관리해야 하며, Expo의 managed workflow 단순성이 일부 감소
- Skia Canvas의 터치 히트 테스트를 직접 구현해야 함 (SVG의 개별 요소 onPress 대비 추가 작업)

#### Option B: Bare RN + Skia (Expo 완전 제거) - 기각

| 항목 | 내용 |
|------|------|
| **상태** | **기각됨** |
| **기각 사유** | Expo SDK 52의 `npx expo prebuild`로 네이티브 코드 접근이 이미 가능하므로, Expo 제거의 핵심 동기(네이티브 접근 불가)가 해소됨. expo-router → React Navigation 전환, 엔트리포인트 교체, Metro/Babel 설정 재작성, 웹 빌드 폐기 등 불필요한 작업이 5일 이상 추가되며, 이는 렌더링 품질 향상이라는 본래 목표와 무관한 리스크를 수반. |

#### Option C: Bare RN + expo-gl (Three.js/R3F) - 기각

| 항목 | 내용 |
|------|------|
| **상태** | **기각됨** |
| **기각 사유** | expo-modules-core 의존성이 잔존하여 Expo 완전 제거 원칙에도 위배되며, 2D 보드게임에 3D 엔진은 과잉 (Three.js 번들 크기 ~600KB gzipped, 학습 곡선). Option A가 더 적은 변경으로 동일한 GPU 렌더링 품질을 달성. |

#### Option D: react-native-wgpu (WebGPU) - 무효화

| 항목 | 내용 |
|------|------|
| **상태** | **무효화됨** |
| **무효화 사유** | 2026년 4월 기준 react-native-wgpu는 아직 실험적 단계. iOS Metal 백엔드는 작동하나 Android Vulkan 지원이 불완전. 생태계 도구(디버거, 프로파일러)가 부재하며, 프로덕션 사례가 극소수. 2D 보드게임의 렌더링 요구사항 대비 리스크가 과도함. |

### 2.4 ADR (Architecture Decision Record)

| 항목 | 내용 |
|------|------|
| **Decision** | Option A: Expo 유지 + @shopify/react-native-skia 하이브리드 |
| **Drivers** | (1) 렌더링 품질 향상이 본래 목표이므로 변경 범위를 렌더링에 한정, (2) Expo prebuild + Skia config plugin으로 네이티브 접근과 Expo 생태계를 동시 보존, (3) 웹 SVG fallback으로 플랫폼 도달 범위 유지 |
| **Alternatives** | Option B (Bare RN + Skia): Expo 제거가 불필요한 작업량을 5일 이상 추가하므로 기각. Option C (expo-gl + Three.js): 2D 게임에 3D 엔진 과잉으로 기각. Option D (WebGPU): 실험적 상태로 무효화. |
| **Why Chosen** | Expo SDK 52의 prebuild 시스템이 네이티브 코드 접근을 이미 보장하므로, Expo를 제거할 기술적 이유가 소멸. Skia의 Expo config plugin 공식 지원으로 `app.json` 한 줄 추가만으로 통합 가능. 렌더링 컴포넌트 3개만 변경하면 되므로 마이그레이션 기간이 10일에서 5~6일로 단축되고, 롤백 위험이 대폭 감소. |
| **Consequences** | Board 컴포넌트가 네이티브/웹 이중 파일로 분리되어 유지보수 비용 소폭 증가. `ios/`, `android/` 디렉토리가 prebuild로 생성되어 gitignore 또는 버전 관리 정책 결정 필요. |
| **Follow-ups** | 웹 사용자가 증가하면 웹 전용 Canvas2D/Pixi.js 렌더러를 `SvgBoard.web.tsx` 위치에 별도 구현 검토. Skia 웹 지원(CanvasKit WASM)이 안정화되면 웹도 Skia로 통합하여 이중 코드 해소 가능. |

---

## 3. 마이그레이션 전략 (단계별)

### Phase 0: Skia 설치 + expo prebuild (Day 1)

**목표:** Skia 패키지 설치, Expo config plugin 설정, 네이티브 프로젝트 생성 및 빌드 확인

#### TODO 0.1: Skia 패키지 설치

```bash
pnpm -F @yut-nori/mobile add @shopify/react-native-skia
pnpm -F @yut-nori/mobile add react-native-reanimated
```

#### TODO 0.2: app.json에 Skia config plugin 추가

```json
{
  "expo": {
    "plugins": [
      "@shopify/react-native-skia"
    ]
  }
}
```

#### TODO 0.3: babel.config.js에 Reanimated plugin 추가

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      '@babel/plugin-transform-class-static-block', // 기존 유지 (colyseus.js 호환)
      'react-native-reanimated/plugin', // 반드시 마지막
    ],
  };
};
```

#### TODO 0.4: expo prebuild로 네이티브 프로젝트 생성

```bash
cd apps/mobile
npx expo prebuild
```
- `ios/`, `android/` 디렉토리 자동 생성
- Skia 네이티브 모듈이 config plugin에 의해 자동 링크

#### TODO 0.5: iOS CocoaPods 설치 및 빌드 확인

```bash
cd apps/mobile/ios && pod install
cd .. && npx expo run:ios
```

#### TODO 0.6: Android Gradle sync 및 빌드 확인

```bash
cd apps/mobile && npx expo run:android
```

**Acceptance Criteria:**
- [ ] `@shopify/react-native-skia`와 `react-native-reanimated`가 `package.json`에 추가됨
- [ ] `app.json`에 Skia config plugin이 등록됨
- [ ] `npx expo prebuild` 정상 완료, `ios/`와 `android/` 디렉토리 생성
- [ ] iOS 시뮬레이터에서 기존 앱이 정상 실행 (기존 SVG Board 그대로)
- [ ] Android 에뮬레이터에서 기존 앱이 정상 실행
- [ ] `npx expo start --web`으로 웹 빌드가 여전히 동작

---

### Phase 1: Board.tsx Skia 렌더링 교체 (Day 2-4)

**목표:** Board.tsx를 플랫폼 분기하여 네이티브는 Skia Canvas, 웹은 기존 SVG 유지

#### TODO 1.1: Board.tsx 플랫폼 분기 파일 생성

**현재:**
```
src/components/board/Board.tsx    ← SVG 렌더링 (단일 파일)
```

**신규:**
```
src/components/board/
├── Board.tsx              ← 공통 인터페이스 (Platform.select 분기)
├── SkiaBoard.native.tsx   ← Skia Canvas 기반 GPU 렌더링 (iOS/Android)
├── SvgBoard.web.tsx       ← 기존 SVG 코드 유지 (웹)
└── hitTest.ts             ← Skia Canvas 터치 히트 테스트 모듈
```

**Board.tsx (분기 엔트리포인트):**
```typescript
// React Native의 플랫폼 분기 파일 규칙 활용
// - SkiaBoard.native.tsx → iOS/Android에서 자동 선택
// - SvgBoard.web.tsx → 웹에서 자동 선택
// 또는 명시적 Platform.select 사용
export { default } from './SkiaBoard';  // .native.tsx / .web.tsx 자동 분기
```

#### TODO 1.2: SvgBoard.web.tsx 생성 (기존 코드 이전)

현재 `Board.tsx`의 SVG 렌더링 코드를 그대로 `SvgBoard.web.tsx`로 이동. 변경 사항 없음.

#### TODO 1.3: SkiaBoard.native.tsx 작성 (핵심 작업)

**SVG → Skia 변환 매핑:**

| SVG 컴포넌트 | Skia API | 비고 |
|-------------|---------|------|
| `<Svg width height viewBox>` | `<Canvas style={{ width, height }}>` | viewBox 대신 style 크기 |
| `<Line x1 y1 x2 y2>` | `<Line p1={vec(x1,y1)} p2={vec(x2,y2)}>` 또는 `<Path>` | Path로 연결하면 대시 효과 가능 |
| `<Circle cx cy r fill stroke>` | `<Circle cx={cx} cy={cy} r={r}>` + `<Paint>` | Paint로 fill/stroke 분리 |
| `<SvgText x y fontSize>` | `<Text x={x} y={y} font={font}>` | Skia Font 객체 필요 (`useFont`) |
| `onPress` (SVG Circle) | Canvas `onTouch` + hitTest 모듈 | 별도 히트 테스트 구현 |

**Skia 구조:**
```
SkiaBoard component
├── getNodePositions()          ← shared 패키지에서 가져옴 (변경 없음)
├── toScreen(x, y)             ← 정규화 좌표 → 픽셀 변환 (동일)
├── useFont()                  ← Skia 폰트 로딩
├── useTouchHandler()          ← 터치 → 노드 히트 테스트
├── <Canvas>
│   ├── edges: <Path> 또는 <Line>
│   ├── nodes: <Circle> + <Paint>
│   │   ├── 하이라이트: <Circle> + 펄스 애니메이션
│   │   └── 라벨: <Text font={font}>
│   └── mals: <Circle> + <Paint>
│       └── 이동 애니메이션: useSharedValue + withTiming
└── </Canvas>
```

#### TODO 1.4: hitTest.ts 터치 히트 테스트 모듈 구현

SVG에서는 각 `<Circle onPress>`로 개별 이벤트를 받았으나, Skia는 `<Canvas>` 레벨에서 터치 좌표를 받아 히트 테스트를 직접 수행해야 함:

```typescript
// 터치 좌표와 가장 가까운 노드 찾기
const handleTouch = (x: number, y: number) => {
  const hitNode = findClosestNode(x, y, NODE_HIT_RADIUS);
  if (hitNode !== null) onNodePress(hitNode);
};
```

#### TODO 1.5: Skia 폰트 로딩

Skia의 `<Text>`는 `SkFont` 객체 필요:
```typescript
import { useFont } from '@shopify/react-native-skia';

const font = useFont(require('./assets/fonts/NotoSansKR-Bold.otf'), 14);
```
- 한국어 텍스트를 위한 NotoSansKR 또는 시스템 폰트 바인딩

#### TODO 1.6: 말 렌더링 Skia 전환

말(Mal) 렌더링을 Skia `<Circle>` + `<Paint>`로 전환:
- 팀별 TEAM_COLORS 적용
- 같은 노드 위의 복수 말 오프셋 처리
- 말 선택 상태 시각적 피드백 (테두리 강조)

**Acceptance Criteria:**
- [ ] iOS/Android에서 Skia Canvas로 윷판 렌더링, 60fps 유지
- [ ] 웹에서 기존 SVG Board가 동일하게 동작
- [ ] 29개 노드 + 간선 + 지름길 정확히 표시
- [ ] 노드 터치 → 말 이동 동작 (AI 모드, 온라인 모드 모두)
- [ ] 노드 하이라이트 (이동 가능 위치) 정상 표시
- [ ] 말 색상 (팀별 TEAM_COLORS) 정확히 구분
- [ ] 한국어 텍스트 (노드 라벨) 정상 렌더링

---

### Phase 2: 애니메이션 Reanimated 업그레이드 (Day 4-5)

**목표:** SkillGauge, ChatBubbles, 말 이동 애니메이션을 Animated API에서 Reanimated 3으로 전환

#### TODO 2.1: SkillGauge - Animated → Reanimated 전환

**현재 (Animated API):**
- `Animated.timing` 루프 (게이지 좌우 이동)
- `Animated.View`로 인디케이터 위치 제어

**신규 (Reanimated 3):**

| 요소 | 현재 | 신규 |
|------|------|------|
| 게이지 바 진행 | `Animated.timing` + View | `useSharedValue` + `withTiming` + `useAnimatedStyle` |
| 게이지 인디케이터 | `Animated.View left%` | `useAnimatedStyle` + `useDerivedValue` |
| 버튼 프레스 반응 | 없음 | `withSpring` 스케일 애니메이션 |
| 게이지 값 → React 상태 동기화 | `animValue.addListener(({ value }) => setGaugePosition(value))` | `useAnimatedReaction(() => gaugeValue.value, (v) => runOnJS(setGaugePosition)(v))` — SharedValue(UI 스레드)를 JS 스레드 상태로 동기화. 게이지 zone 계산에 필요. |

#### TODO 2.2: ChatBubbles - Animated → Reanimated 전환

**현재 (Animated API):**
- `Animated.sequence` (버블 페이드 인/아웃)

**신규 (Reanimated 3):**

| 요소 | 현재 | 신규 |
|------|------|------|
| 버블 등장 | `Animated.timing` opacity | `withTiming` opacity + `withSpring` translateY |
| 버블 소멸 | `Animated.timing` opacity | `withDelay` + `withTiming` fadeOut |

#### TODO 2.3: 말 이동 애니메이션 Reanimated 전환

**현재:** 말 위치 즉시 변경 (텔레포트)

**신규:**

| 요소 | 현재 | 신규 |
|------|------|------|
| 말 이동 | 즉시 텔레포트 | `withTiming`/`withSpring`으로 경로를 따라 부드럽게 이동 |
| 말 잡기 | 없음 | 시각적 피드백 (스케일 펄스 또는 색상 플래시) |
| 노드 하이라이트 | fill 색상 토글 | `withRepeat` 펄스 애니메이션 |
| 윷 결과 표시 | Text 변경 | 결과 텍스트 스케일+페이드 트랜지션 |

**Acceptance Criteria:**
- [ ] SkillGauge 게이지 애니메이션이 Reanimated로 동작 (UI 스레드, 60fps)
- [ ] ChatBubbles 페이드 인/아웃 애니메이션 정상 동작
- [ ] 말 이동 시 경로를 따라 부드러운 애니메이션 재생
- [ ] 노드 하이라이트 펄스 애니메이션 동작
- [ ] 웹에서도 Reanimated 애니메이션이 동작 (Reanimated 웹 지원 활용)

---

### Phase 3: 검증 + iOS/Android 빌드 테스트 (Day 5-6)

**목표:** 전 플랫폼, 전 게임 모드 동작 검증

#### TODO 3.1: iOS 시뮬레이터 테스트

| 시나리오 | 검증 항목 |
|---------|----------|
| AI 대전 풀 게임 | 윷 던지기 → 말 선택 → 이동 애니메이션 → 잡기 → 골인 → 승리/패배 |
| 온라인 1v1 | 서버 연결 → 매칭 → 턴 교대 → 타이머 → 결과 |
| 설정 변경 | 언어 전환 (ko/en/ja) → 사운드 토글 → 게이지 모드 |
| 캐릭터 선택 | 무료 캐릭터 선택 → 프리미엄 잠금 확인 |
| 네비게이션 | 모든 스크린 이동 → 뒤로가기 |

#### TODO 3.2: Android 에뮬레이터 테스트

TODO 3.1과 동일한 시나리오를 Android에서 반복 수행.

#### TODO 3.3: 웹 SVG fallback 테스트

```bash
npx expo start --web
```

| 시나리오 | 검증 항목 |
|---------|----------|
| 윷판 렌더링 | 기존 SVG Board가 동일하게 표시 |
| 게임 플로우 | AI 대전 풀 플로우 동작 |
| 애니메이션 | Reanimated 웹 호환 동작 확인 |
| 라우팅 | expo-router 웹 라우팅 정상 |

#### TODO 3.4: 성능 검증

| 메트릭 | 목표 | 측정 방법 |
|--------|------|----------|
| FPS (윷판 Skia 렌더링) | 60fps 안정 | Flipper / React DevTools |
| 앱 시작 시간 | 기존과 동등 또는 개선 | Xcode Instruments / Android Profiler |
| 메모리 사용량 | < 150MB (게임 중) | Xcode Memory Graph |

**Acceptance Criteria:**
- [ ] iOS에서 AI 모드 풀 게임 완주 가능
- [ ] Android에서 AI 모드 풀 게임 완주 가능
- [ ] 웹에서 SVG fallback으로 풀 게임 완주 가능
- [ ] Colyseus 서버 연결 + 온라인 대전 동작 (iOS/Android)
- [ ] 3개 언어 전환 정상 (모든 플랫폼)
- [ ] 게이지 모드 (classic/skill) 모두 동작
- [ ] 캐릭터 선택 + 구독 상태 연동
- [ ] Skia 렌더링 60fps 유지 (네이티브)

---

## 4. 변경되는 파일/패키지 목록

### 4.1 새로 생성되는 파일

| 파일 | 용도 |
|------|------|
| `apps/mobile/src/components/board/SkiaBoard.native.tsx` | Skia Canvas 기반 윷판 (iOS/Android) |
| `apps/mobile/src/components/board/SvgBoard.web.tsx` | 기존 SVG 윷판 (웹 fallback) |
| `apps/mobile/src/components/board/hitTest.ts` | Skia Canvas 터치 히트 테스트 모듈 |
| `apps/mobile/ios/` | iOS 네이티브 프로젝트 (`expo prebuild` 자동 생성) |
| `apps/mobile/android/` | Android 네이티브 프로젝트 (`expo prebuild` 자동 생성) |

### 4.2 수정되는 파일

| 파일 | 변경 내용 |
|------|----------|
| `apps/mobile/src/components/board/Board.tsx` | SVG 렌더링 코드 제거, 플랫폼 분기 엔트리포인트로 전환 |
| `apps/mobile/src/components/board/SkillGauge.tsx` | Animated → Reanimated 전환 |
| `apps/mobile/src/components/board/ChatBubbles.tsx` | Animated → Reanimated 전환 |
| `apps/mobile/app.json` | Skia config plugin 추가 |
| `apps/mobile/babel.config.js` | Reanimated plugin 추가 |
| `apps/mobile/package.json` | Skia, Reanimated 의존성 추가 |

### 4.3 변경 없는 파일

| 파일/디렉토리 | 사유 |
|-------------|------|
| `apps/server/*` | Colyseus 서버 독립 |
| `packages/shared/*` | 게임 로직 독립 |
| `apps/mobile/app/*` (라우팅 파일 전체) | expo-router 유지, 변경 불필요 |
| `apps/mobile/src/stores/*` | Expo/렌더링 의존성 없음 |
| `apps/mobile/src/services/gameClient.ts` | 변경 불필요 (웹 분기 유지) |
| `apps/mobile/src/i18n/*` | 의존성 없음 |
| `apps/mobile/metro.config.js` | expo/metro-config 유지 |
| `apps/mobile/src/components/AdBanner.tsx` | 변경 불필요 |

---

## 5. 새로운 의존성 목록

### 5.1 추가 (Production)

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `@shopify/react-native-skia` | ^1.8 | GPU 가속 2D 렌더링 (네이티브) |
| `react-native-reanimated` | ^3.17 | UI 스레드 애니메이션 |

### 5.2 유지 (Production, 변경 없음)

| 패키지 | 용도 |
|--------|------|
| `expo` ~52.0.0 | 프레임워크 코어 |
| `expo-router` ~4.0.0 | 파일 기반 라우팅 |
| `expo-constants` ~17.0.0 | 앱 상수 |
| `expo-linking` ~7.0.0 | 딥링크 |
| `expo-status-bar` ~2.0.0 | 상태바 |
| `react-native-svg` ^15.15.4 | 웹 SVG fallback |
| `react` 18.3.1 | React 코어 |
| `react-native` 0.76.5 | RN 코어 |
| `react-dom` 18.3.1 | 웹 렌더링 |
| `react-native-web` ~0.19.13 | 웹 지원 |
| `react-native-safe-area-context` 4.12.0 | Safe Area |
| `react-native-screens` ~4.4.0 | 네이티브 스크린 |
| `colyseus.js` 0.16 | 멀티플레이어 |
| `zustand` ^5.0.12 | 상태 관리 |
| `nanoid` ^5.1.9 | ID 생성 |
| `@yut-nori/shared` workspace:* | 게임 로직 |

### 5.3 제거

없음. 기존 의존성을 모두 유지.

### 5.4 수정 (DevDependencies)

| 파일 | 변경 |
|------|------|
| `babel.config.js` | `react-native-reanimated/plugin` 추가 (기존 babel-preset-expo 유지) |

**의존성 변화:** 16개 → 18개 (Skia + Reanimated 2개 추가, 제거 없음)

---

## 6. 렌더링 레이어 교체 상세

### 6.1 Board.tsx → 플랫폼 분기 변환 가이드

**현재 SVG 구조 (Board.tsx, 147줄):**
```
Board component
├── getNodePositions()          ← shared 패키지에서 가져옴 (변경 없음)
├── toScreen(x, y)             ← 정규화 좌표 → 픽셀 변환 (동일)
├── renderEdges()              ← <Line> 20+개
├── renderNodes()              ← <Circle> 29개 + <SvgText> 5개
└── renderMals()               ← <Circle> 말 (위치별 오프셋)
```

**신규 Skia 구조 (SkiaBoard.native.tsx):**
```
SkiaBoard component
├── getNodePositions()          ← 동일
├── toScreen(x, y)             ← 동일
├── useFont()                  ← Skia 폰트 로딩
├── useTouchHandler()          ← 터치 → hitTest 모듈 호출
├── <Canvas>
│   ├── edges: <Path> 또는 <Line>
│   ├── nodes: <Circle> + <Paint>
│   │   ├── 하이라이트: <Circle> + 펄스 애니메이션
│   │   └── 라벨: <Text font={font}>
│   └── mals: <Circle> + <Paint>
│       └── 이동 애니메이션: useSharedValue + withTiming
└── </Canvas>
```

**신규 SVG 구조 (SvgBoard.web.tsx):**
```
기존 Board.tsx 코드 그대로 이동 (변경 없음)
```

### 6.2 시각적 개선 기회 (Skia GPU 활용)

SVG에서는 불가능했지만 Skia에서 가능한 효과 (Phase 1에서 기본 전환 후, 이후 점진적 적용):

| 효과 | Skia API | 적용 대상 |
|------|---------|----------|
| 그라데이션 배경 | `<LinearGradient>` | 윷판 배경 (나무결 느낌) |
| 그림자/글로우 | `<Shadow>` / `<Blur>` | 하이라이트 노드, 말 |
| 경로 애니메이션 | `usePathInterpolation` | 말 이동 궤적 |
| 파티클 | `<Vertices>` + shader | 말 잡기, 골인 이펙트 |
| 커스텀 셰이더 | `<Shader>` (SKSL) | 물결 효과, 빛 반사 |
| 블러/마스크 | `<BackdropBlur>` | 결과 오버레이 |

---

## 7. 테스트 전략

### 7.1 단위 테스트 (변경 없음)

`packages/shared/`의 게임 로직 테스트는 마이그레이션 영향을 받지 않음:
- `BoardGraph` 경로 계산
- `PathCalculator` 이동 로직
- `YutProbability` 확률 분포

### 7.2 컴포넌트 테스트

| 컴포넌트 | 테스트 도구 | 검증 항목 |
|---------|-----------|----------|
| SkiaBoard.native | `@testing-library/react-native` + Skia mock | 노드 개수, 터치 핸들러 호출 |
| SvgBoard.web | `@testing-library/react` | 기존 SVG 테스트 유지 |
| SkillGauge | `@testing-library/react-native` + Reanimated mock | 버튼 disabled 상태, onThrow 콜백 |
| ChatBubbles | `@testing-library/react-native` | 메시지 전송, 쿨다운 |
| hitTest | 순수 함수 단위 테스트 | 좌표 → 노드 매칭 정확도 |

### 7.3 통합 테스트

| 시나리오 | 방법 |
|---------|------|
| AI 대전 풀 플로우 (네이티브) | Detox 또는 Maestro E2E |
| AI 대전 풀 플로우 (웹) | Playwright 또는 Cypress |
| 서버 연동 | Colyseus 테스트 서버 + 클라이언트 연결 |
| 네비게이션 플로우 | 모든 스크린 순회 (expo-router 기존 테스트 유지) |

### 7.4 성능 테스트

| 메트릭 | 목표 | 측정 방법 |
|--------|------|----------|
| FPS (Skia 윷판 렌더링) | 60fps 안정 | Flipper / React DevTools |
| FPS (SVG 웹 렌더링) | 기존과 동등 | Chrome DevTools Performance |
| 앱 시작 시간 | 기존과 동등 또는 개선 | Xcode Instruments / Android Profiler |
| 메모리 사용량 | < 150MB (게임 중) | Xcode Memory Graph |

---

## 8. 타임라인 요약

| Phase | 기간 | 핵심 작업 | 위험도 |
|-------|------|----------|--------|
| **Phase 0** | Day 1 | Skia 설치, expo prebuild, 네이티브 빌드 확인 | LOW |
| **Phase 1** | Day 2-4 | Board.tsx 플랫폼 분기, Skia 렌더링 구현, 터치 히트 테스트 | **HIGH** |
| **Phase 2** | Day 4-5 | SkillGauge/ChatBubbles/말 이동 Reanimated 전환 | MEDIUM |
| **Phase 3** | Day 5-6 | 전 플랫폼 검증, 성능 테스트 | LOW |

**총 예상 기간:** 5~6일 (1주 스프린트)
**최대 위험 구간:** Phase 1 (SkiaBoard.native.tsx 작성 + Skia 터치 핸들링)

---

## 9. 롤백 전략

하이브리드 접근의 최대 장점은 **단계별 롤백이 가능**하다는 점.

### Phase 0 롤백
```bash
# Skia, Reanimated 제거
pnpm -F @yut-nori/mobile remove @shopify/react-native-skia react-native-reanimated
# app.json에서 plugin 제거, babel.config.js에서 plugin 제거
# ios/, android/ 디렉토리 삭제
rm -rf apps/mobile/ios apps/mobile/android
```

### Phase 1 롤백
```bash
# 플랫폼 분기 파일 삭제, 원본 Board.tsx 복원
rm apps/mobile/src/components/board/SkiaBoard.native.tsx
rm apps/mobile/src/components/board/SvgBoard.web.tsx
rm apps/mobile/src/components/board/hitTest.ts
git checkout -- apps/mobile/src/components/board/Board.tsx
```

### Phase 2 롤백
```bash
# Reanimated 코드 되돌리기
git checkout -- apps/mobile/src/components/board/SkillGauge.tsx
git checkout -- apps/mobile/src/components/board/ChatBubbles.tsx
```

기존 Expo 앱이 그대로 남아있으므로 `apps/mobile-expo-backup/` 같은 별도 백업이 불필요.

---

## 10. 이전 계획 대비 변경 요약

| 항목 | 이전 (Bare RN) | 현재 (하이브리드) |
|------|---------------|-----------------|
| **Expo** | 완전 제거 | 유지 |
| **네비게이션** | expo-router → React Navigation 교체 | expo-router 유지 (변경 없음) |
| **엔트리포인트** | expo-router/entry → AppRegistry | expo-router/entry 유지 |
| **Metro 설정** | expo/metro-config → @react-native/metro-config | expo/metro-config 유지 |
| **Babel 설정** | babel-preset-expo → @react-native/babel-preset | babel-preset-expo 유지 + Reanimated plugin 추가 |
| **웹 지원** | 폐기 | SVG fallback으로 유지 |
| **빌드** | RN CLI 직접 | `npx expo prebuild` + `expo run:ios/android` |
| **변경 파일 수** | ~20개 (전면 재작성) | ~6개 (렌더링 컴포넌트만) |
| **소요 기간** | 10일 | 5~6일 |
| **롤백** | 전체 롤백만 가능 | Phase별 단계 롤백 가능 |

---

## 부록: Open Questions

1. **prebuild 디렉토리 관리** -- `ios/`, `android/`를 git에 포함할지, `.gitignore`에 추가하고 CI에서 매번 `expo prebuild`를 실행할지 정책 결정 필요
2. **AdMob 통합** -- AdBanner가 현재 placeholder. 실제 AdMob SDK 통합은 마이그레이션 이후 별도 작업인지 확인 필요
3. **인앱 결제** -- SubscriptionStore가 mock 상태. 네이티브 전환 시 실제 IAP (expo-in-app-purchases 또는 react-native-iap) 통합 시점 결정 필요
4. **Skia CanvasKit WASM** -- 향후 Skia의 웹 지원(CanvasKit WASM)이 안정화되면 웹도 Skia로 통합하여 이중 코드 해소 가능성 모니터링
5. **CI/CD** -- EAS Build 활용 여부 또는 `expo prebuild` + GitHub Actions 직접 구성 결정 필요
