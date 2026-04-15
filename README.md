# Yut Nori Game (윷놀이)

React Native 기반 모바일 윷놀이 온라인 대전 게임

## Overview

"쉽고, 빠르고, 공정한 모바일 윷놀이" - 전통 윷놀이의 전략성과 운의 조화를 현대적 모바일 UX로 재해석.

## Features

- **1v1 / 2v2 온라인 대전** - 실시간 매칭 + 방 만들기
- **스킬 게이지** - 골프 게임 스타일 타이밍 게이지 (클래식/스킬 모드 선택)
- **AI 대전** - 3단계 난이도 (오프라인 가능)
- **스피드 모드** - 10초 턴, 말 2개 (Phase 2)
- **아이템 모드** - 전략 아이템 사용 (Phase 3)
- **리더보드** - 승수 기반 글로벌/친구 리더보드 (월별 초기화)

## Tech Stack

| Area | Technology |
|------|-----------|
| Client | React Native (Expo Dev Client), Zustand, expo-router |
| Rendering | react-native-skia, Rive, Lottie, Reanimated |
| Server | Colyseus (TypeScript) |
| Auth/DB | Firebase Auth + Firestore |
| Payment | RevenueCat |
| Ads | react-native-google-mobile-ads |

## Documents

- [Game Plan (기획서)](docs/GAME_PLAN.md)
- [Open Questions](docs/OPEN_QUESTIONS.md)

## Roadmap

```
Month 1-3:  Phase 1 (MVP) - 1v1, 2v2, AI, 매칭, 로그인, 스킬 게이지
Month 4-5:  Phase 2 - 수익화, 리더보드, 친구초대, 스피드모드, 캐릭터
Month 6-7:  Phase 3 - 아이템 모드, 시즌 운영, 최적화
Month 8+:   운영 / 글로벌 확장
```
