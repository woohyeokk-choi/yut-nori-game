import { YutResult, GaugeZone } from '../types';

/**
 * 윷 결과 확률 생성기
 * 
 * 기본 확률 (전통 윷 물리적 확률 기반):
 * 도: 25%, 개: 31%, 걸: 25%, 윷: 13%, 모: 6%
 * 
 * 스킬 게이지 보정 (±2%p):
 * PERFECT: 윷/모 +2%p, 도 -2%p
 * GOOD: 윷/모 +1%p, 도 -1%p
 * NORMAL: 보정 없음
 * BAD: 도 +2%p, 윷/모 -1%p
 */

interface ProbabilityTable {
  do: number;
  gae: number;
  geol: number;
  yut: number;
  mo: number;
}

const BASE_PROBABILITY: ProbabilityTable = {
  do: 0.25,
  gae: 0.31,
  geol: 0.25,
  yut: 0.13,
  mo: 0.06,
};

const GAUGE_ADJUSTMENT: Record<GaugeZone, Partial<ProbabilityTable>> = {
  perfect: { do: -0.02, yut: 0.02, mo: 0.02 },
  good:    { do: -0.01, yut: 0.01, mo: 0.01 },
  normal:  {},
  bad:     { do: 0.02, yut: -0.01, mo: -0.01 },
};

export class YutProbability {
  /**
   * 윷 결과 생성 (서버 전용)
   */
  static getResult(gaugeZone: GaugeZone = 'normal'): YutResult {
    const adjusted = this.getAdjustedProbabilities(gaugeZone);
    const random = Math.random();
    
    let cumulative = 0;
    const entries: [YutResult, number][] = [
      ['do', adjusted.do],
      ['gae', adjusted.gae],
      ['geol', adjusted.geol],
      ['yut', adjusted.yut],
      ['mo', adjusted.mo],
    ];

    for (const [result, prob] of entries) {
      cumulative += prob;
      if (random < cumulative) {
        return result;
      }
    }

    return 'gae'; // fallback
  }

  /**
   * 게이지 보정 적용된 확률 테이블
   */
  static getAdjustedProbabilities(gaugeZone: GaugeZone): ProbabilityTable {
    const adj = GAUGE_ADJUSTMENT[gaugeZone];
    const result = { ...BASE_PROBABILITY };

    for (const [key, delta] of Object.entries(adj)) {
      result[key as keyof ProbabilityTable] += delta as number;
    }

    // 확률 합이 1이 되도록 gae에서 보정
    const sum = result.do + result.gae + result.geol + result.yut + result.mo;
    result.gae += (1.0 - sum);

    return result;
  }

  /**
   * 게이지 위치(0~1)에서 영역 판정
   * 0.45~0.55 = perfect (중앙 10%)
   * 0.35~0.65 = good (중앙 30%)  
   * 0.2~0.8 = normal (중앙 60%)
   * 나머지 = bad (양쪽 끝 20%)
   */
  static calculateGaugeZone(position: number): GaugeZone {
    const center = Math.abs(position - 0.5);
    if (center <= 0.05) return 'perfect';
    if (center <= 0.15) return 'good';
    if (center <= 0.30) return 'normal';
    return 'bad';
  }

  /**
   * 서버 타이밍 기반 게이지 검증 (1-zone tolerance)
   */
  static validateGaugeZone(
    clientZone: GaugeZone,
    serverZone: GaugeZone
  ): GaugeZone {
    const zones: GaugeZone[] = ['perfect', 'good', 'normal', 'bad'];
    const clientIdx = zones.indexOf(clientZone);
    const serverIdx = zones.indexOf(serverZone);
    
    // 1단계 차이 이내면 클라이언트 값 수용
    if (Math.abs(clientIdx - serverIdx) <= 1) {
      return clientZone;
    }
    // 그 이상 차이면 서버 값 사용
    return serverZone;
  }
}
