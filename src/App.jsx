import { useState, useEffect, useRef } from 'react'
import './App.css'

const SCORE_LABELS = {
  profit: '수익성',
  adEfficiency: '광고효율',
  marketFit: '시장적합성',
  operations: '운영관리',
  trust: '바이어 신뢰도',
}

const INITIAL_SCORES = {
  profit: 50,
  adEfficiency: 50,
  marketFit: 50,
  operations: 50,
  trust: 50,
}

function applyEffects(scores, effects) {
  const next = { ...scores }
  for (const key of Object.keys(effects)) {
    next[key] = (next[key] ?? 0) + effects[key]
  }
  return next
}

// Clamps a number into [min, max]. Centralized here so every place that
// needs to keep a HUD value in range (바이어 신뢰도/시장적합성/광고효율: 0-100,
// 예산: 0 and up) uses the same rule.
function clampValue(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

// Total score is calculated exactly as before (average of the original 4
// core scores, clamped 0-100). 바이어 신뢰도(trust) is tracked and displayed
// separately and intentionally does NOT affect this calculation, per the
// existing FINAL RESULT scoring logic.
function computeTotalScore(scores) {
  const totalRaw = Math.round(
    (scores.profit + scores.adEfficiency + scores.marketFit + scores.operations) / 4,
  )
  return clampValue(totalRaw, 0, 100)
}

// Budget reacts to strategy choices as a percentage of the CURRENT budget
// (rounded to the nearest ₩10,000), so the effect scales naturally whether
// the mission budget is small or large. Never goes below 0.
function applyBudgetChange(budget, pct) {
  if (!pct) return budget
  const delta = Math.round((budget * pct) / 10000) * 10000
  return clampValue(budget + delta, 0, Infinity)
}

// Nominal default HUD state shape (7단계 스펙 3번). Real gameplay still
// derives its starting budget from the selected product's mission briefing
// (see getMissionBriefing) and its starting 바이어신뢰도/시장적합성/광고효율
// from INITIAL_SCORES, so the existing per-product budget/점수 시스템 keeps
// working exactly as before — this constant documents the intended default
// shape and is what the HUD shows before a mission has actually started.
const initialGameState = {
  budget: 1000000,
  buyerTrust: 50,
  marketFit: 50,
  adEfficiency: 50,
  turn: 1,
}

// Applies one strategy option's already country/product-adjusted effects to
// the running scores + budget. The three HUD-tracked fields (바이어 신뢰도,
// 시장적합성, 광고효율) are clamped to 0-100 and the budget is clamped to a
// non-negative amount, per 7단계 스펙 10번. profit/operations are left as
// they were before (only the final average is clamped, unchanged behavior).
function applyStrategyEffect(scores, budget, effects, budgetPct) {
  const nextScoresRaw = applyEffects(scores, effects)
  const nextScores = {
    ...nextScoresRaw,
    trust: clampValue(nextScoresRaw.trust, 0, 100),
    marketFit: clampValue(nextScoresRaw.marketFit, 0, 100),
    adEfficiency: clampValue(nextScoresRaw.adEfficiency, 0, 100),
  }
  const nextBudget = applyBudgetChange(budget, budgetPct)
  return { scores: nextScores, budget: nextBudget }
}

// FINAL RESULT score, 7단계 스펙 11번: keeps the existing computeTotalScore
// formula completely intact as the base, then folds in a small, bounded
// (±5 each) adjustment from the accumulated budget efficiency and buyer
// trust so the HUD state genuinely matters at the end without ever pushing
// the result to an extreme.
function calculateFinalScore(scores, budget, initialBudget) {
  const baseTotal = computeTotalScore(scores)
  const budgetRatio = initialBudget > 0 ? budget / initialBudget : 1
  const budgetBonus = clampValue(Math.round((budgetRatio - 1) * 20), -5, 5)
  const trustBonus = clampValue(Math.round((scores.trust - 50) / 10), -5, 5)
  return clampValue(baseTotal + budgetBonus + trustBonus, 0, 100)
}

// Multiplies each score field by the market's per-field weight (see
// MARKET_PROFILES.scoreWeights), so the same strategy is worth more or less
// depending on what that market actually values.
function applyScoreWeights(effects, weights) {
  const out = {}
  for (const [key, value] of Object.entries(effects)) {
    out[key] = Math.round(value * (weights?.[key] ?? 1))
  }
  return out
}

// Scales every field of an effects object by a single flat factor. Used for
// MARKET_PROFILES.conditionalEmphasis, where a product attribute (e.g. high
// competition) makes an entire round matter more in a given market.
function scaleAllEffects(effects, factor) {
  const out = {}
  for (const [key, value] of Object.entries(effects)) {
    out[key] = Math.round(value * factor)
  }
  return out
}

const MARKET_OPTIONS = [
  {
    id: 'JP',
    name: 'JAPAN',
    nameKo: '일본',
    description: '브랜드 신뢰와 리뷰가 중요한 시장',
    strategy: 'REVIEW / BRANDING',
  },
  {
    id: 'SG',
    name: 'SINGAPORE',
    nameKo: '싱가포르',
    description: '온라인 판매와 가격 경쟁이 중요한 시장',
    strategy: 'PRICE / ADVERTISING',
  },
  {
    id: 'UZ',
    name: 'UZBEKISTAN',
    nameKo: '우즈베키스탄',
    description: '시장 개척과 현지 유통이 중요한 신흥시장',
    strategy: 'PRICE / DISTRIBUTION',
  },
  {
    id: 'CN',
    name: 'CHINA',
    nameKo: '중국',
    description: '현지화와 경쟁 대응이 중요한 시장',
    strategy: 'LOCALIZATION / NEGOTIATION',
  },
  {
    id: 'US',
    name: 'UNITED STATES',
    nameKo: '미국',
    description: '시장 규모가 크고 차별화 경쟁이 치열한 시장',
    strategy: 'DIFFERENTIATION / MARKETING',
  },
  {
    id: 'GB',
    name: 'UNITED KINGDOM',
    nameKo: '영국',
    description: '브랜드 신뢰와 제품 가치 제안이 중요한 시장',
    strategy: 'BRANDING / VALUE',
  },
]

// Country-level characteristics, kept as its own data structure separate
// from PRODUCT_CATALOG so a new market can be added later just by adding one
// entry here. Keyed by the same market id used in MARKET_OPTIONS.
//
// - scoreWeights: per-field multiplier (0.9~1.15, intentionally mild) applied
//   to every strategy's score effects in this market — reflects what this
//   market genuinely values (수익성/광고효율/시장적합성/운영관리/바이어신뢰도).
// - conditionalEmphasis: when the selected product matches one attribute
//   value, the listed rounds matter even more in this market (상품 특성 +
//   국가 특성 결합).
// - specialRules: small, targeted bonus/penalty for a specific strategy
//   choice in this market, capturing the qualitative trade-offs described
//   for each country (e.g. 저가 전략이 일본에서는 신뢰도에 불이익을 준다).
// - hint: shown once on the MISSION screen — a nudge, not the answer.
// - buyerIntro: the buyer's opening concern, shown in AI BUYER FEEDBACK.
// - emphasisLabel: short label of this market's core strategy focus.
const MARKET_PROFILES = {
  JP: {
    scoreWeights: { profit: 0.95, adEfficiency: 1.0, marketFit: 1.05, operations: 1.1, trust: 1.15 },
    conditionalEmphasis: {
      attr: 'demand',
      value: '높음',
      rounds: ['ad', 'localization'],
      multiplier: 1.1,
      note: '시장수요가 높은 상품일수록 브랜드·리뷰 전략의 효과가 커집니다.',
    },
    specialRules: [
      {
        roundKey: 'price',
        optionId: 'A',
        delta: { trust: -3, marketFit: -2 },
        note: '가격을 지나치게 낮추면 브랜드 가치와 신뢰도에 불이익을 줄 수 있습니다.',
      },
    ],
    hint: '신뢰와 리뷰를 확보하는 것이 중요합니다.',
    buyerIntro: '제품의 품질과 브랜드 신뢰도에 관심이 있습니다.',
    emphasisLabel: '브랜딩 · 리뷰 · 프리미엄 포지셔닝',
  },
  SG: {
    scoreWeights: { profit: 0.95, adEfficiency: 1.15, marketFit: 1.1, operations: 0.95, trust: 1.0 },
    conditionalEmphasis: {
      attr: 'competition',
      value: '높음',
      rounds: ['price', 'ad'],
      multiplier: 1.1,
      note: '경쟁이 치열한 상품일수록 가격·광고 전략의 영향이 커집니다.',
    },
    specialRules: [
      {
        roundKey: 'ad',
        optionId: 'C',
        delta: { profit: -2 },
        note: '과도한 광고비는 수익성을 추가로 감소시킵니다.',
      },
    ],
    hint: '온라인 광고와 가격 경쟁력을 고려하세요.',
    buyerIntro: '온라인 시장에서 경쟁력 있는 가격과 광고 전략이 중요합니다.',
    emphasisLabel: '가격 · 광고',
  },
  UZ: {
    scoreWeights: { profit: 0.9, adEfficiency: 1.0, marketFit: 1.15, operations: 1.1, trust: 1.0 },
    conditionalEmphasis: {
      attr: 'competition',
      value: '높음',
      rounds: ['price'],
      multiplier: 1.12,
      note: '가격 민감도가 높은 상품일수록 가격 전략의 영향이 커집니다.',
    },
    specialRules: [
      {
        roundKey: 'price',
        optionId: 'C',
        delta: { marketFit: -3, trust: -2 },
        note: '프리미엄 가격은 시장 적합성과 거래 가능성에 불리하게 작용할 수 있습니다.',
      },
    ],
    hint: '가격과 안정적인 유통망을 고려하세요.',
    buyerIntro: '현지 시장에서 경쟁력 있는 가격과 안정적인 공급이 중요합니다.',
    emphasisLabel: '가격 · 유통 · 거래조건',
  },
  CN: {
    scoreWeights: { profit: 0.95, adEfficiency: 1.0, marketFit: 1.15, operations: 0.95, trust: 1.1 },
    conditionalEmphasis: {
      attr: 'localizationDifficulty',
      value: '높음',
      rounds: ['localization'],
      multiplier: 1.12,
      note: '현지화 난이도가 높은 상품일수록 현지화 전략의 중요도가 커집니다.',
    },
    specialRules: [
      {
        roundKey: 'localization',
        optionId: 'C',
        delta: { marketFit: 3, trust: 3 },
        note: '적극적인 현지화는 시장 적합성과 바이어 신뢰도를 함께 높입니다.',
      },
      {
        roundKey: 'price',
        optionId: 'C',
        condition: (product) => product.competition === '높음',
        delta: { marketFit: -3 },
        note: '경쟁이 치열한 상품에서 가격 경쟁력이 부족하면 시장 적합성이 감소할 수 있습니다.',
      },
    ],
    hint: '현지화와 경쟁 대응 전략이 중요합니다.',
    buyerIntro: '현지 소비자에게 맞는 제품과 가격 전략을 확인하고 싶습니다.',
    emphasisLabel: '현지화 · 가격 · 협상',
  },
  US: {
    scoreWeights: { profit: 1.0, adEfficiency: 1.15, marketFit: 1.1, operations: 0.9, trust: 0.95 },
    conditionalEmphasis: {
      attr: 'competition',
      value: '높음',
      rounds: ['ad', 'price'],
      multiplier: 1.1,
      note: '경쟁이 치열한 상품일수록 차별화·광고 전략의 중요도가 커집니다.',
    },
    specialRules: [
      {
        roundKey: 'price',
        optionId: 'A',
        delta: { marketFit: -3 },
        note: '저가 전략은 가격 경쟁력은 높이지만 브랜드 차별화에는 불리하게 작용할 수 있습니다.',
      },
    ],
    hint: '차별화된 가치 제안을 만들어보세요.',
    buyerIntro: '이미 유사한 제품이 많기 때문에 차별화된 가치가 필요합니다.',
    emphasisLabel: '차별화 · 광고 · 프리미엄 전략',
  },
  GB: {
    scoreWeights: { profit: 1.0, adEfficiency: 0.95, marketFit: 1.05, operations: 0.95, trust: 1.15 },
    conditionalEmphasis: null,
    specialRules: [
      {
        roundKey: 'price',
        optionId: 'A',
        delta: { marketFit: -2, trust: -2 },
        note: '지나치게 저렴한 가격은 프리미엄 브랜드의 가치 인식에 영향을 줄 수 있습니다.',
      },
    ],
    hint: '브랜드 신뢰와 제품의 가치를 고려하세요.',
    buyerIntro: '제품의 브랜드 가치와 소비자에게 제공하는 명확한 가치가 중요합니다.',
    emphasisLabel: '브랜딩 · 가치 제안 · 가격 균형',
  },
}

// Simple inline-SVG flags (viewBox 0 0 3 2) so country flags render
// consistently across platforms/fonts instead of relying on
// regional-indicator flag emoji.
function MarketFlagIcon({ code, className = 'market-option__flag' }) {
  const flagContent = {
    JP: (
      <>
        <rect width="3" height="2" fill="#ffffff" />
        <circle cx="1.5" cy="1" r="0.6" fill="#bc002d" />
      </>
    ),
    SG: (
      <>
        <rect width="3" height="1" fill="#ed2939" />
        <rect y="1" width="3" height="1" fill="#ffffff" />
        <circle cx="0.55" cy="0.5" r="0.32" fill="#ffffff" />
        <circle cx="0.68" cy="0.5" r="0.27" fill="#ed2939" />
        <circle cx="0.95" cy="0.3" r="0.045" fill="#ffffff" />
        <circle cx="1.05" cy="0.45" r="0.045" fill="#ffffff" />
        <circle cx="1.02" cy="0.65" r="0.045" fill="#ffffff" />
        <circle cx="0.88" cy="0.65" r="0.045" fill="#ffffff" />
        <circle cx="0.85" cy="0.45" r="0.045" fill="#ffffff" />
      </>
    ),
    UZ: (
      <>
        <rect width="3" height="2" fill="#1eb53a" />
        <rect width="3" height="0.913" fill="#0099b5" />
        <rect y="0.913" width="3" height="0.174" fill="#ffffff" />
        <rect y="0.913" width="3" height="0.03" fill="#ce1126" />
        <rect y="1.057" width="3" height="0.03" fill="#ce1126" />
        <circle cx="0.5" cy="0.35" r="0.22" fill="#ffffff" />
        <circle cx="0.6" cy="0.35" r="0.18" fill="#0099b5" />
        <circle cx="0.95" cy="0.18" r="0.045" fill="#ffffff" />
        <circle cx="1.05" cy="0.28" r="0.045" fill="#ffffff" />
        <circle cx="1.05" cy="0.42" r="0.045" fill="#ffffff" />
      </>
    ),
    CN: (
      <>
        <rect width="3" height="2" fill="#de2910" />
        <polygon
          points="0.5,0.3 0.61,0.64 0.97,0.64 0.68,0.85 0.79,1.19 0.5,0.98 0.21,1.19 0.32,0.85 0.03,0.64 0.39,0.64"
          fill="#ffde00"
        />
        <circle cx="1.0" cy="0.25" r="0.06" fill="#ffde00" />
        <circle cx="1.15" cy="0.45" r="0.06" fill="#ffde00" />
        <circle cx="1.15" cy="0.75" r="0.06" fill="#ffde00" />
        <circle cx="1.0" cy="0.95" r="0.06" fill="#ffde00" />
      </>
    ),
    US: (
      <>
        <rect width="3" height="2" fill="#ffffff" />
        <rect width="3" height="0.2222" fill="#b22234" />
        <rect y="0.4444" width="3" height="0.2222" fill="#b22234" />
        <rect y="0.8889" width="3" height="0.2222" fill="#b22234" />
        <rect y="1.3333" width="3" height="0.2222" fill="#b22234" />
        <rect y="1.7778" width="3" height="0.2222" fill="#b22234" />
        <rect width="1.2" height="1.0769" fill="#3c3b6e" />
      </>
    ),
    GB: (
      <>
        <rect width="3" height="2" fill="#012169" />
        <path d="M0,0 L3,2 M3,0 L0,2" stroke="#ffffff" strokeWidth="0.4" />
        <path d="M0,0 L3,2 M3,0 L0,2" stroke="#c8102e" strokeWidth="0.16" />
        <path d="M1.5,0 L1.5,2 M0,1 L3,1" stroke="#ffffff" strokeWidth="0.6" />
        <path d="M1.5,0 L1.5,2 M0,1 L3,1" stroke="#c8102e" strokeWidth="0.24" />
      </>
    ),
  }

  return (
    <svg
      className={className}
      viewBox="0 0 3 2"
      role="img"
      aria-label={`${code} 국기`}
    >
      {flagContent[code] ?? null}
    </svg>
  )
}

// Product data, kept separate from the screen components so new products can
// be added later just by extending this object (3 entries per market id).
const PRODUCT_CATALOG = {
  JP: [
    {
      id: 'JP-1',
      name: 'JENNY HONG 진정 크림',
      category: '화장품',
      price: 28000,
      moq: 500,
      demand: '높음',
      competition: '높음',
      localizationDifficulty: '보통',
      adDifficulty: '보통',
      sellingPoint:
        '리뷰와 브랜드 신뢰가 중요한 일본 시장에서 저자극 성분 강조가 유효합니다.',
    },
    {
      id: 'JP-2',
      name: '홍삼 스틱',
      category: '건강/뷰티',
      price: 32000,
      moq: 300,
      demand: '보통',
      competition: '보통',
      localizationDifficulty: '높음',
      adDifficulty: '보통',
      sellingPoint:
        '한국 홍삼의 프리미엄 이미지를 활용한 건강 선물 세트로 포지셔닝할 수 있습니다.',
    },
    {
      id: 'JP-3',
      name: '반려동물 그루밍 브러시',
      category: '반려동물 제품',
      price: 15000,
      moq: 1000,
      demand: '보통',
      competition: '낮음',
      localizationDifficulty: '낮음',
      adDifficulty: '낮음',
      sellingPoint:
        '일본의 높은 반려동물 케어 지출 성향에 맞춘 프리미엄 그루밍 제품입니다.',
    },
  ],
  SG: [
    {
      id: 'SG-1',
      name: '비타민C 브라이트닝 세럼',
      category: '화장품',
      price: 24000,
      moq: 500,
      demand: '높음',
      competition: '높음',
      localizationDifficulty: '낮음',
      adDifficulty: '보통',
      sellingPoint:
        '다인종 소비자를 겨냥한 브라이트닝 효과 중심 마케팅이 효과적입니다.',
    },
    {
      id: 'SG-2',
      name: '즉석 김치찌개 밀키트',
      category: '식품',
      price: 9000,
      moq: 1000,
      demand: '보통',
      competition: '보통',
      localizationDifficulty: '높음',
      adDifficulty: '높음',
      sellingPoint:
        '다문화 시장 특성상 할랄 인증 여부가 구매 전환에 큰 영향을 미칩니다.',
    },
    {
      id: 'SG-3',
      name: '휴대용 공기청정기',
      category: '생활용품',
      price: 45000,
      moq: 200,
      demand: '보통',
      competition: '낮음',
      localizationDifficulty: '낮음',
      adDifficulty: '보통',
      sellingPoint:
        '고온다습한 기후와 대기질 이슈로 실내 공기 관리 제품 수요가 꾸준합니다.',
    },
  ],
  UZ: [
    {
      id: 'UZ-1',
      name: '코스메틱 로션 세트',
      category: '화장품',
      price: 12000,
      moq: 1000,
      demand: '보통',
      competition: '낮음',
      localizationDifficulty: '보통',
      adDifficulty: '낮음',
      sellingPoint:
        '가격 민감도가 높은 신흥시장 특성상 합리적인 가격대가 핵심 경쟁력입니다.',
    },
    {
      id: 'UZ-2',
      name: '라면 멀티팩',
      category: '식품',
      price: 6000,
      moq: 2000,
      demand: '높음',
      competition: '보통',
      localizationDifficulty: '낮음',
      adDifficulty: '낮음',
      sellingPoint:
        '한류 영향으로 한국 라면에 대한 인지도와 선호도가 빠르게 상승 중입니다.',
    },
    {
      id: 'UZ-3',
      name: '주방용 실리콘 용품',
      category: '생활용품',
      price: 8000,
      moq: 1500,
      demand: '보통',
      competition: '낮음',
      localizationDifficulty: '낮음',
      adDifficulty: '낮음',
      sellingPoint:
        '현지 유통망 확보가 관건이며 실용적인 생활용품에 대한 수요가 꾸준합니다.',
    },
  ],
  CN: [
    {
      id: 'CN-1',
      name: '마스크팩 세트',
      category: '화장품',
      price: 10000,
      moq: 2000,
      demand: '높음',
      competition: '높음',
      localizationDifficulty: '높음',
      adDifficulty: '높음',
      sellingPoint:
        '치열한 K-뷰티 경쟁 속에서 인플루언서 마케팅과 라이브커머스 대응이 필수적입니다.',
    },
    {
      id: 'CN-2',
      name: '유아용 간식 스낵',
      category: '식품',
      price: 7000,
      moq: 3000,
      demand: '높음',
      competition: '높음',
      localizationDifficulty: '높음',
      adDifficulty: '높음',
      sellingPoint:
        '엄격한 식품 안전 인증과 수입 통관 절차 대응이 진입장벽이자 핵심 과제입니다.',
    },
    {
      id: 'CN-3',
      name: '반려동물 기능성 사료',
      category: '반려동물 제품',
      price: 22000,
      moq: 1000,
      demand: '보통',
      competition: '보통',
      localizationDifficulty: '보통',
      adDifficulty: '보통',
      sellingPoint:
        '빠르게 성장하는 중국 반려동물 시장에서 프리미엄 사료 수요가 확대되고 있습니다.',
    },
  ],
  US: [
    {
      id: 'US-1',
      name: '콜라겐 뷰티 드링크',
      category: '건강/뷰티',
      price: 18000,
      moq: 500,
      demand: '높음',
      competition: '높음',
      localizationDifficulty: '보통',
      adDifficulty: '높음',
      sellingPoint:
        '웰니스 트렌드에 맞춘 명확한 효능 소구와 차별화된 브랜드 스토리가 필요합니다.',
    },
    {
      id: 'US-2',
      name: '프리미엄 그래놀라',
      category: '식품',
      price: 14000,
      moq: 800,
      demand: '보통',
      competition: '높음',
      localizationDifficulty: '보통',
      adDifficulty: '높음',
      sellingPoint:
        'FDA 라벨링 규정 준수와 함께 건강식 포지셔닝이 판매 성패를 좌우합니다.',
    },
    {
      id: 'US-3',
      name: '반려동물 자동 급식기',
      category: '반려동물 제품',
      price: 65000,
      moq: 300,
      demand: '높음',
      competition: '높음',
      localizationDifficulty: '낮음',
      adDifficulty: '보통',
      sellingPoint:
        '대형 반려동물 시장에서 스마트 기기에 대한 관심이 높아 차별화 포인트로 적합합니다.',
    },
  ],
  GB: [
    {
      id: 'GB-1',
      name: '저자극 스킨케어 세트',
      category: '화장품',
      price: 26000,
      moq: 500,
      demand: '보통',
      competition: '보통',
      localizationDifficulty: '보통',
      adDifficulty: '보통',
      sellingPoint:
        '클린뷰티 트렌드에 맞춘 성분 투명성과 지속가능성 메시지가 신뢰를 높입니다.',
    },
    {
      id: 'GB-2',
      name: '유기농 티백 세트',
      category: '식품',
      price: 11000,
      moq: 600,
      demand: '보통',
      competition: '보통',
      localizationDifficulty: '낮음',
      adDifficulty: '보통',
      sellingPoint:
        '차 문화가 발달한 영국에서 유기농·공정무역 인증이 구매 결정에 영향을 줍니다.',
    },
    {
      id: 'GB-3',
      name: '친환경 생활용품 세트',
      category: '생활용품',
      price: 16000,
      moq: 700,
      demand: '보통',
      competition: '낮음',
      localizationDifficulty: '낮음',
      adDifficulty: '낮음',
      sellingPoint:
        '지속가능성에 대한 소비자 인식이 높아 친환경 소재 강조가 효과적입니다.',
    },
  ],
}

function getProductsByMarket(marketId) {
  return PRODUCT_CATALOG[marketId] ?? []
}

// The 4-round mission decision structure. Each round targets one of the
// existing 4 scores via `effects`, plus a small `adjustments` bonus/penalty
// keyed by the selected product's own attribute value (see `attributeKey`)
// so a product's real characteristics nudge the outcome, and an AI BUYER
// FEEDBACK generator that reads the selected market/product into its text.
const STRATEGY_ROUNDS = [
  {
    key: 'price',
    icon: '\u{1F4B0}',
    title: 'PRICE STRATEGY',
    resultLabel: '가격 전략',
    prompt: '이 상품에 어떤 가격 전략을 적용하시겠습니까?',
    attributeKey: 'competition',
    options: [
      {
        id: 'A',
        title: '저가 전략',
        subtitle: '가격을 낮춰 초기 구매자를 확보한다',
        effects: { profit: -5, adEfficiency: 0, marketFit: 7, operations: 0, trust: 4 },
        budgetPct: -0.05,
        adjustments: {
          높음: { marketFit: 2 },
          낮음: { profit: -1, marketFit: -1 },
        },
        result: [
          '가격을 낮춰 초기 구매자를 확보하는 전략을 선택했습니다.',
          '초기 유입에는 도움이 되지만 판매당 수익성은 낮아집니다.',
        ],
        buyerFeedback: (market, product) => ({
          strategy: '저가 전략',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 가격 경쟁력을 긍정적으로 평가했습니다.`,
            product.competition === '높음'
              ? '경쟁이 치열한 시장에서는 가격 인하가 특히 효과적이라는 반응입니다.'
              : '경쟁이 크지 않은 시장이라 가격 인하보다 수익성 확보가 더 중요할 수 있다는 의견입니다.',
          ],
          tip: [
            '가격 경쟁력은 초기 진입에는 유리하지만 장기적인 수익성도 함께 고려해야 합니다.',
          ],
        }),
      },
      {
        id: 'B',
        title: '표준 가격',
        subtitle: '가격과 수익성의 균형을 가져간다',
        effects: { profit: 10, adEfficiency: 4, marketFit: 9, operations: 7, trust: 2 },
        budgetPct: 0,
        adjustments: {
          높음: { profit: -1 },
          낮음: { profit: 1 },
        },
        result: ['가격과 수익성의 균형을 고려하는 전략을 선택했습니다.'],
        buyerFeedback: (market, product) => ({
          strategy: '표준 가격',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 합리적인 가격 정책에 신뢰를 보였습니다.`,
            product.competition === '높음'
              ? '치열한 경쟁 속에서도 무리한 가격 경쟁을 피한 점을 긍정적으로 평가했습니다.'
              : '경쟁이 적은 시장에서 안정적인 가격 정책이 신뢰를 높였다는 반응입니다.',
          ],
          tip: [
            '표준 가격 전략은 리스크가 낮지만 강한 차별화 포인트가 없다면 성장 속도가 더딜 수 있습니다.',
          ],
        }),
      },
      {
        id: 'C',
        title: '프리미엄 가격',
        subtitle: '고가 포지셔닝으로 브랜드 가치를 강조한다',
        effects: { profit: 12, adEfficiency: -3, marketFit: -2, operations: 5, trust: -2 },
        budgetPct: 0.05,
        adjustments: {
          높음: { marketFit: -2 },
          낮음: { marketFit: 2 },
        },
        result: ['고가 포지셔닝으로 브랜드 가치를 강조하는 전략입니다.'],
        buyerFeedback: (market, product) => ({
          strategy: '프리미엄 가격',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 프리미엄 포지셔닝에 대해 신중한 반응을 보였습니다.`,
            product.competition === '높음'
              ? '경쟁이 치열한 시장에서 고가 전략은 설득력 있는 차별화 근거가 필요하다는 의견입니다.'
              : '경쟁이 적은 시장에서는 프리미엄 포지셔닝이 오히려 브랜드 가치를 높일 수 있다는 반응입니다.',
          ],
          tip: [
            '프리미엄 전략은 수익성을 높이지만 시장 적합성 확보를 위한 근거 마련이 중요합니다.',
          ],
        }),
      },
    ],
  },
  {
    key: 'ad',
    icon: '\u{1F4C8}',
    title: 'AD STRATEGY',
    resultLabel: '광고 전략',
    prompt: '어떤 광고 전략으로 시장에 진입하시겠습니까?',
    attributeKey: 'adDifficulty',
    options: [
      {
        id: 'A',
        title: '광고 최소화',
        subtitle: '광고비를 최소화해 초기 비용 부담을 줄인다',
        effects: { profit: 5, adEfficiency: -4, marketFit: -3, operations: 4, trust: -2 },
        budgetPct: 0.1,
        adjustments: {
          높음: { marketFit: -2 },
          낮음: { marketFit: 1 },
        },
        result: [
          '광고비를 최소화해 초기 비용 부담을 줄이는 전략입니다.',
          '광고 예산이 감소했지만 초기 비용 부담이 줄었습니다.',
        ],
        buyerFeedback: (market, product) => ({
          strategy: '광고 최소화',
          feedback: [
            `${market.name} 바이어는 ${product.name}의 낮은 광고 투자에 대해 우려를 나타냈습니다.`,
            product.adDifficulty === '높음'
              ? '광고 난이도가 높은 상품일수록 최소한의 노출도 확보하기 어렵다는 반응입니다.'
              : '광고 난이도가 낮은 상품이라 최소한의 광고로도 큰 문제가 없다는 의견입니다.',
          ],
          tip: ['광고를 최소화하면 비용은 아낄 수 있지만 시장 노출 기회를 놓칠 수 있습니다.'],
        }),
      },
      {
        id: 'B',
        title: '일반 광고',
        subtitle: '표준적인 광고 예산으로 안정적인 노출을 확보한다',
        effects: { profit: 5, adEfficiency: 10, marketFit: 10, operations: 5, trust: 2 },
        budgetPct: -0.08,
        adjustments: {
          높음: { adEfficiency: -1 },
          낮음: { adEfficiency: 1 },
        },
        result: [
          '표준적인 광고 예산으로 안정적인 노출을 확보하는 전략입니다.',
          '광고 예산이 적절히 집행되어 시장 노출도가 상승했습니다.',
        ],
        buyerFeedback: (market, product) => ({
          strategy: '일반 광고',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 안정적인 광고 집행을 긍정적으로 평가했습니다.`,
            product.adDifficulty === '높음'
              ? '광고 난이도가 높은 시장에서는 표준 수준의 광고로는 부족할 수 있다는 의견도 있었습니다.'
              : '광고 난이도가 낮아 표준 수준의 광고만으로도 충분한 노출 효과를 기대할 수 있습니다.',
          ],
          tip: [
            '일반 광고 전략은 균형 잡힌 접근이지만 경쟁이 치열할수록 추가 투자가 필요할 수 있습니다.',
          ],
        }),
      },
      {
        id: 'C',
        title: '공격적 광고',
        subtitle: '공격적인 광고 투자로 빠른 시장 진입을 노린다',
        effects: { profit: -6, adEfficiency: 13, marketFit: 9, operations: -2, trust: 1 },
        budgetPct: -0.18,
        adjustments: {
          높음: { adEfficiency: 2 },
          낮음: { profit: -1 },
        },
        result: [
          '공격적인 광고 투자로 빠른 시장 진입을 노리는 전략입니다.',
          '광고 예산이 크게 증가했지만 시장 노출도가 큰 폭으로 상승했습니다.',
        ],
        buyerFeedback: (market, product) => ({
          strategy: '공격적 광고',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 공격적인 광고 전략에 놀라움을 표했습니다.`,
            product.adDifficulty === '높음'
              ? '광고 난이도가 높은 시장에서 과감한 투자가 노출 확대에 실질적으로 도움이 되었다는 반응입니다.'
              : '광고 난이도가 낮은 상품에는 다소 과한 투자일 수 있다는 신중한 의견도 있었습니다.',
          ],
          tip: [
            '공격적인 광고는 빠른 노출 확대에 효과적이지만 비용 부담과 운영 효율을 함께 점검해야 합니다.',
          ],
        }),
      },
    ],
  },
  {
    key: 'localization',
    icon: '\u{1F30F}',
    title: 'LOCALIZATION STRATEGY',
    resultLabel: '현지화 전략',
    prompt: '어떤 수준으로 현지화를 진행하시겠습니까?',
    attributeKey: 'localizationDifficulty',
    options: [
      {
        id: 'A',
        title: '최소 현지화',
        subtitle: '현지화를 최소화해 초기 비용을 절감한다',
        effects: { profit: 6, adEfficiency: 0, marketFit: -4, operations: 5, trust: -3 },
        budgetPct: 0.05,
        adjustments: {
          높음: { marketFit: -2 },
          낮음: { marketFit: 2 },
        },
        result: ['현지화를 최소화해 초기 비용을 절감하는 전략입니다.'],
        buyerFeedback: (market, product) => ({
          strategy: '최소 현지화',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 낮은 현지화 수준을 지적했습니다.`,
            product.localizationDifficulty === '높음'
              ? '현지화 난이도가 높은 시장에서는 최소한의 현지화로는 신뢰를 얻기 어렵다는 반응입니다.'
              : '현지화 난이도가 낮은 상품이라 최소한의 현지화로도 큰 무리가 없다는 의견입니다.',
          ],
          tip: [
            '현지화를 최소화하면 비용은 절감되지만 시장 적합성 확보에는 한계가 있을 수 있습니다.',
          ],
        }),
      },
      {
        id: 'B',
        title: '기본 현지화',
        subtitle: '기본적인 현지화로 시장 적합성을 높인다',
        effects: { profit: 5, adEfficiency: 7, marketFit: 12, operations: 6, trust: 2 },
        budgetPct: -0.07,
        adjustments: {
          높음: { marketFit: -1 },
          낮음: { marketFit: 1 },
        },
        result: ['기본적인 현지화로 시장 적합성을 높이는 전략입니다.'],
        buyerFeedback: (market, product) => ({
          strategy: '기본 현지화',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 현지화 수준에 대체로 만족감을 보였습니다.`,
            product.localizationDifficulty === '높음'
              ? '다만 현지화 난이도가 높은 시장에서는 기본 수준 이상의 대응이 필요할 수 있다는 의견도 있었습니다.'
              : '현지화 난이도가 낮아 기본 수준의 현지화만으로도 충분하다는 반응입니다.',
          ],
          tip: ['기본 현지화는 무난한 선택이지만 시장 난이도가 높다면 추가 투자를 고려해야 합니다.'],
        }),
      },
      {
        id: 'C',
        title: '적극적 현지화',
        subtitle: '적극적인 현지화 투자로 시장 적합성을 극대화한다',
        effects: { profit: -4, adEfficiency: 6, marketFit: 13, operations: -2, trust: 5 },
        budgetPct: -0.15,
        adjustments: {
          높음: { operations: -2 },
          낮음: { operations: 1 },
        },
        result: ['적극적인 현지화 투자로 시장 적합성을 극대화하는 전략입니다.'],
        buyerFeedback: (market, product) => ({
          strategy: '적극적 현지화',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 적극적인 현지화 노력에 깊은 인상을 받았습니다.`,
            product.localizationDifficulty === '높음'
              ? '현지화 난이도가 높은 시장인 만큼 이런 투자가 신뢰 구축에 크게 기여했다는 반응입니다.'
              : '현지화 난이도가 낮은 상품이라 다소 과한 투자일 수 있다는 신중한 의견도 있었습니다.',
          ],
          tip: [
            '적극적인 현지화는 시장 적합성을 크게 높이지만 운영 부담 증가도 함께 고려해야 합니다.',
          ],
        }),
      },
    ],
  },
  {
    key: 'deal',
    icon: '\u{1F91D}',
    title: 'DEAL STRATEGY',
    resultLabel: '거래 전략',
    prompt: '바이어와의 첫 거래를 어떻게 진행하시겠습니까?',
    attributeKey: 'demand',
    options: [
      {
        id: 'A',
        title: 'MOQ 낮추기',
        subtitle: '첫 거래의 진입장벽을 낮추기 위해 MOQ를 낮춘다',
        effects: { profit: -2, adEfficiency: 3, marketFit: 8, operations: 3, trust: 3 },
        budgetPct: -0.03,
        adjustments: {
          높음: { marketFit: -1 },
          낮음: { marketFit: 2 },
        },
        result: ['첫 거래의 진입장벽을 낮추기 위해 MOQ를 낮추는 전략입니다.'],
        buyerFeedback: (market, product) => ({
          strategy: 'MOQ 낮추기',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 낮아진 MOQ를 반겼습니다.`,
            product.demand === '높음'
              ? '시장수요가 높은 상품이라 낮은 MOQ로도 충분한 물량을 빠르게 소화할 수 있다는 의견입니다.'
              : '시장수요가 낮은 상품에서는 낮은 MOQ가 테스트 구매에 특히 유리하다는 반응입니다.',
          ],
          tip: [
            'MOQ를 낮추면 첫 거래 성사 가능성은 높아지지만 물류 및 수익성 측면의 부담도 커질 수 있습니다.',
          ],
        }),
      },
      {
        id: 'B',
        title: '가격 협상',
        subtitle: '가격 조건을 조정해 거래 성사 가능성을 높인다',
        effects: { profit: -2, adEfficiency: 2, marketFit: 7, operations: 5, trust: 2 },
        budgetPct: -0.02,
        adjustments: {
          높음: { profit: 1 },
          낮음: { profit: -1 },
        },
        result: ['가격 조건을 조정해 거래 성사 가능성을 높이는 전략입니다.'],
        buyerFeedback: (market, product) => ({
          strategy: '가격 협상',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 가격 협상 태도를 긍정적으로 평가했습니다.`,
            product.demand === '높음'
              ? '시장수요가 높은 상품이라 약간의 가격 조정만으로도 거래가 빠르게 성사될 수 있다는 반응입니다.'
              : '시장수요가 낮은 상품에서는 가격 협상이 거래 성사에 결정적인 역할을 할 수 있다는 의견입니다.',
          ],
          tip: ['가격 협상은 거래 성사에 효과적이지만 장기적인 가격 정책과의 균형이 필요합니다.'],
        }),
      },
      {
        id: 'C',
        title: '빠른 거래',
        subtitle: '기존 거래조건을 유지해 빠르게 거래를 성사시킨다',
        effects: { profit: 9, adEfficiency: 5, marketFit: 7, operations: 9, trust: 2 },
        budgetPct: 0.03,
        adjustments: {
          높음: { operations: 1 },
          낮음: { operations: -1 },
        },
        result: ['기존 거래조건을 유지해 빠르게 거래를 성사시키는 전략입니다.'],
        buyerFeedback: (market, product) => ({
          strategy: '빠른 거래',
          feedback: [
            `${market.name} 바이어가 ${product.name}의 신속한 거래 진행을 신뢰했습니다.`,
            product.demand === '높음'
              ? '시장수요가 높은 상품이라 빠른 거래 성사가 곧바로 매출 기회로 이어질 수 있다는 반응입니다.'
              : '시장수요가 낮은 상품에서는 신중한 검토 없이 빠르게 진행하는 것에 우려도 있었습니다.',
          ],
          tip: ['빠른 거래는 운영 효율을 높이지만 조건 검토가 충분했는지 점검하는 것이 중요합니다.'],
        }),
      },
    ],
  },
]

// Derives the mission dashboard's numbers from the selected product so a
// higher-value or harder product naturally means a bigger budget / tougher
// target, without needing extra fields on PRODUCT_CATALOG.
function getMissionBriefing(product) {
  const budget = Math.round((product.price * 15) / 10000) * 10000
  const targetSales = product.moq
  const competitionBonus =
    product.competition === '높음' ? 5 : product.competition === '낮음' ? -5 : 0
  const targetScore = 65 + competitionBonus
  return { budget, targetSales, targetScore, totalRounds: STRATEGY_ROUNDS.length }
}

function ChoiceCard({ option, selected, onSelect }) {
  return (
    <button
      type="button"
      className={
        selected ? 'choice-card choice-card--selected' : 'choice-card'
      }
      onClick={() => onSelect(option)}
      aria-pressed={selected}
    >
      <span className="choice-card__letter">{option.id}</span>
      <span className="choice-card__text">
        <span className="choice-card__title">{option.title}</span>
        {option.subtitle && (
          <span className="choice-card__subtitle">{option.subtitle}</span>
        )}
        {option.keyEffects && option.keyEffects.length > 0 && (
          <span className="choice-card__effects">
            {option.keyEffects.map((item) => (
              <span
                key={item.key}
                className={
                  item.value > 0
                    ? 'choice-card__key-effect choice-card__key-effect--up'
                    : 'choice-card__key-effect choice-card__key-effect--down'
                }
              >
                {item.label} {item.value > 0 ? `+${item.value}` : item.value}
              </span>
            ))}
          </span>
        )}
        {option.breakdown && (
          <ul className="choice-card__breakdown">
            {option.breakdown.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <span>{item.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </span>
    </button>
  )
}

// ---- 9-1단계: START 화면 ----
// 이번 단계는 START 화면의 UI/UX만 바꾼다. onStart prop과 그 동작(눌렀을 때
// 기존과 동일하게 MARKET SELECT로 이동)은 전혀 건드리지 않는다. 표시되는
// STARTING BUDGET도 새로 만든 값이 아니라, 실제 게임이 미션 시작 전 budget
// state의 기본값으로 쓰는 initialGameState.budget을 그대로 가져와 보여준다.
// MARKET PREVIEW도 국가를 하드코딩하지 않고, 기존 MARKET SELECT 화면이 쓰는
// 것과 동일한 MARKET_OPTIONS(및 그 안의 MarketFlagIcon)를 그대로 map()해서
// 보여준다 — MARKET_PROFILES/MARKET_OPTIONS에 국가가 추가/삭제되면 START
// 화면의 미리보기도 코드 수정 없이 자동으로 함께 바뀐다.
function StartScreen({ onStart }) {
  return (
    <div className="start-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="start-card">
        <div className="brand">
          <span className="brand__eyebrow">GTEP</span>
          <h1 className="brand__title">
            TRADE
            <br />
            SIMULATOR
          </h1>
          <p className="start-hero__subtitle">
            REAL-WORLD EXPORT
            <br />
            DECISION GAME
          </p>
        </div>

        <p className="description">
          &quot;Choose your market.
          <br />
          Build your strategy.
          <br />
          Close the deal.&quot;
        </p>

        <section className="start-mission-card">
          <span className="start-mission-card__badge">&#127919; YOUR MISSION</span>
          <p className="start-mission-card__text">
            Enter a global market, make smart trade decisions, and turn your
            strategy into a successful export deal.
          </p>
        </section>

        <section className="start-market-preview" aria-label={`${MARKET_OPTIONS.length} markets preview`}>
          <span className="start-market-preview__label">
            &#127758; {MARKET_OPTIONS.length} MARKETS
          </span>
          <div className="start-market-preview__grid">
            {MARKET_OPTIONS.map((market) => (
              <span key={market.id} className="start-market-preview__item">
                <MarketFlagIcon code={market.id} className="start-market-preview__flag" />
                {market.name}
              </span>
            ))}
          </div>
        </section>

        <div className="start-budget">
          <span className="start-budget__label">&#128176; STARTING BUDGET</span>
          <span className="start-budget__value">
            &#8361;{initialGameState.budget.toLocaleString()}
          </span>
        </div>

        <button type="button" className="start-button start-game-button" onClick={onStart}>
          <span>START GAME</span>
          <span className="start-game-button__arrow" aria-hidden="true">
            &#8594;
          </span>
        </button>

        <p className="start-footer">
          GTEP TRADE SIMULATOR
          <br />
          EXPORT &bull; STRATEGY &bull; NEGOTIATION
        </p>
      </main>
    </div>
  )
}

function MissionScreen({ market, product, briefing, scores, onMissionStart }) {
  const profile = MARKET_PROFILES[market.id]

  return (
    <div className="mission-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="mission-card">
        <span className="mission-badge">MISSION</span>

        <h1 className="mission-title">
          <MarketFlagIcon code={market.id} className="mission-title__flag" />
          {market.name} MARKET
        </h1>

        <div className="mission-body">
          <p>
            당신은 한국 브랜드의
            <br />
            해외시장 담당자입니다.
          </p>
          <p>
            {product.name}으로
            <br />
            {market.name} 시장에서 첫 판매를 만들어내는 것이 이번 미션입니다.
          </p>
          <p>&#128161; {profile.hint}</p>
        </div>

        {/* ---- 9-2단계: MISSION OBJECTIVE 카드 ----
            "이번 턴(미션)에서 무엇을 해야 하는지"를 한눈에 보여주는 목표
            패널. 값은 전부 getMissionBriefing(product)이 실제로 계산한
            briefing에서만 가져오며 새 숫자를 만들어내지 않는다. */}
        <section className="mission-objective">
          <span className="mission-objective__badge">&#127919; MISSION OBJECTIVE</span>
          <p className="mission-objective__text">
            {briefing.totalRounds}번의 의사결정으로 목표 판매량과 목표 점수를
            달성해 {market.name} 바이어와의 계약을 성사시키세요.
          </p>
          <div className="mission-objective__targets">
            <div className="mission-objective__target">
              <span className="mission-objective__target-label">TARGET SALES</span>
              <span className="mission-objective__target-value">
                {briefing.targetSales.toLocaleString()}개
              </span>
            </div>
            <div className="mission-objective__target">
              <span className="mission-objective__target-label">TARGET SCORE</span>
              <span className="mission-objective__target-value">{briefing.targetScore}점</span>
            </div>
            <div className="mission-objective__target">
              <span className="mission-objective__target-label">DECISIONS</span>
              <span className="mission-objective__target-value">{briefing.totalRounds}회</span>
            </div>
          </div>
        </section>

        <dl className="mission-info">
          <div className="mission-info__row">
            <dt>PRODUCT</dt>
            <dd>{product.name}</dd>
          </div>
          <div className="mission-info__row">
            <dt>핵심 전략</dt>
            <dd>{profile.emphasisLabel}</dd>
          </div>
          <div className="mission-info__row">
            <dt>보유 예산</dt>
            <dd>&#8361;{briefing.budget.toLocaleString()}</dd>
          </div>
          <div className="mission-info__row">
            <dt>현재 점수</dt>
            <dd>{computeTotalScore(scores)}점</dd>
          </div>
          <div className="mission-info__row">
            <dt>바이어 신뢰도</dt>
            <dd>{scores.trust}</dd>
          </div>
          <div className="mission-info__row">
            <dt>시장 적합성</dt>
            <dd>{scores.marketFit}</dd>
          </div>
        </dl>

        <button
          type="button"
          className="start-button"
          onClick={onMissionStart}
        >
          MISSION START
        </button>
      </main>
    </div>
  )
}

function SelectMarketScreen({ selectedMarket, onSelect, onNext }) {
  const selectedOption =
    MARKET_OPTIONS.find((market) => market.id === selectedMarket) ?? null

  const handleSelect = (market) => {
    console.log('SELECT MARKET', market.id)
    onSelect(market.id)
  }

  return (
    <div className="market-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="market-card">
        <span className="price-step">01 / 07</span>

        <h1 className="price-title">SELECT MARKET</h1>

        <p className="price-lead">어느 시장에 진출하시겠습니까?</p>
        <p className="price-question">
          진출할 국가에 따라 시장 환경과
          <br />
          무역 전략이 달라집니다.
        </p>

        <div className="market-grid">
          {MARKET_OPTIONS.map((market) => {
            const isSelected = selectedMarket === market.id
            return (
              <button
                type="button"
                key={market.id}
                className={
                  isSelected
                    ? 'market-option market-option--selected'
                    : 'market-option'
                }
                onClick={() => handleSelect(market)}
                aria-pressed={isSelected}
              >
                {isSelected && (
                  <span className="market-option__check" aria-hidden="true">
                    &#10003;
                  </span>
                )}
                <MarketFlagIcon code={market.id} />
                <span className="market-option__name">{market.name}</span>
                <span className="market-option__name-ko">{market.nameKo}</span>
                <span className="market-option__desc">{market.description}</span>
                <span className="market-option__strategy">{market.strategy}</span>
              </button>
            )
          })}
        </div>

        {selectedOption && (
          <section className="result-panel">
            <span className="result-panel__badge">SELECTED MARKET</span>
            <h2 className="result-panel__title">
              <MarketFlagIcon
                code={selectedOption.id}
                className="result-panel__flag"
              />
              {selectedOption.name}
            </h2>
            <div className="result-panel__desc">
              <p>{selectedOption.description}</p>
            </div>
          </section>
        )}

        <button
          type="button"
          className="start-button"
          onClick={onNext}
          disabled={!selectedOption}
        >
          NEXT &#8594;
        </button>
      </main>
    </div>
  )
}

function SelectProductScreen({ market, onNext }) {
  const [selectedId, setSelectedId] = useState(null)

  const productChoices = getProductsByMarket(market?.id).map((product, index) => ({
    id: String(index + 1),
    title: product.name,
    subtitle: product.sellingPoint,
    breakdown: [
      { label: '카테고리', amount: product.category },
      { label: '판매가격', amount: `₩${product.price.toLocaleString()}` },
      { label: 'MOQ', amount: `${product.moq.toLocaleString()}개` },
      { label: '시장수요', amount: product.demand },
      { label: '경쟁도', amount: product.competition },
      { label: '현지화 난이도', amount: product.localizationDifficulty },
      { label: '광고 난이도', amount: product.adDifficulty },
    ],
    product,
  }))

  const selectedChoice =
    productChoices.find((choice) => choice.id === selectedId) ?? null

  const handleSelect = (choice) => {
    console.log('SELECT PRODUCT', choice.product.id)
    setSelectedId(choice.id)
  }

  return (
    <div className="product-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="product-card">
        <span className="mission-badge">SELECT PRODUCT</span>

        <h1 className="mission-title">
          {market && (
            <MarketFlagIcon code={market.id} className="mission-title__flag" />
          )}
          {market ? market.name : ''} PRODUCTS
        </h1>

        <p className="price-lead">
          {market ? market.description : ''}
        </p>
        <p className="price-question">어떤 상품으로 진출하시겠습니까?</p>

        <div className="choice-list">
          {productChoices.map((choice) => (
            <ChoiceCard
              key={choice.id}
              option={choice}
              selected={selectedId === choice.id}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {selectedChoice && (
          <section className="result-panel">
            <span className="result-panel__badge">SELECTED PRODUCT</span>
            <h2 className="result-panel__title">{selectedChoice.product.name}</h2>
            <div className="result-panel__desc">
              <p>{selectedChoice.product.sellingPoint}</p>
            </div>
          </section>
        )}

        {selectedChoice && (
          <button
            type="button"
            className="start-button"
            onClick={() => onNext(selectedChoice.product)}
          >
            이 상품으로 미션 시작
          </button>
        )}
      </main>
    </div>
  )
}

// Combines a strategy option's own effects with this market's characteristics
// (score weights, conditional emphasis, and any special rule for this exact
// choice) into the effects that actually apply, plus human-readable notes
// explaining any country-specific adjustment that fired.
function computeFinalEffects(option, round, market, product) {
  const profile = MARKET_PROFILES[market.id]
  const attributeValue = product[round.attributeKey]

  let effects = applyEffects(option.effects, option.adjustments?.[attributeValue] ?? {})
  effects = applyScoreWeights(effects, profile.scoreWeights)

  const notes = []

  const cond = profile.conditionalEmphasis
  if (cond && product[cond.attr] === cond.value && cond.rounds.includes(round.key)) {
    effects = scaleAllEffects(effects, cond.multiplier)
    notes.push(cond.note)
  }

  for (const rule of profile.specialRules ?? []) {
    if (rule.roundKey === round.key && rule.optionId === option.id && (!rule.condition || rule.condition(product))) {
      effects = applyEffects(effects, rule.delta)
      notes.push(rule.note)
    }
  }

  // Universal product-scale effects, independent of country (7단계 스펙 6번).
  let budgetPctAdjustment = 0
  if (round.key === 'deal' && option.id === 'A' && product.moq >= 1000) {
    const moqBonus = product.moq >= 2000 ? 3 : 2
    effects = applyEffects(effects, { marketFit: moqBonus, trust: moqBonus })
    notes.push('MOQ가 높은 상품일수록 MOQ 완화 효과가 커집니다.')
  }
  if (round.key === 'localization' && product.localizationDifficulty === '높음') {
    budgetPctAdjustment -= 0.03
    notes.push('현지화 난이도가 높은 상품은 현지화 비용이 더 듭니다.')
  }

  return { effects, notes, budgetPctAdjustment }
}

// ---- 9-2단계: TURN 진행 트랙 ----
// turn(1-based 현재 턴)과 totalTurns(=STRATEGY_ROUNDS.length, 하드코딩하지
// 않고 그대로 전달받음)만으로 완료/진행중/남음 상태의 점을 생성한다. 라운드
// 수가 바뀌어도 steps 배열이 totalTurns 기준으로 자동 생성되므로 그대로
// 대응한다.
function TurnProgressTrack({ turn, totalTurns }) {
  const steps = Array.from({ length: totalTurns }, (_, index) => index + 1)
  return (
    <div className="turn-track" role="list" aria-label={`turn ${turn} of ${totalTurns}`}>
      {steps.map((step) => {
        const state = step < turn ? 'done' : step === turn ? 'current' : 'upcoming'
        return (
          <span
            key={step}
            className={`turn-track__step turn-track__step--${state}`}
            role="listitem"
          >
            <span className="turn-track__dot">{state === 'done' ? '✓' : step}</span>
          </span>
        )
      })}
    </div>
  )
}

// ---- 9-3단계: 값이 실제로 바뀔 때만 카드에 짧은 glow/scale 펄스를 주는
// 순수 표시용 래퍼. 이전 값은 useRef로만 기억하고, 어떤 점수/예산도 새로
// 계산하지 않는다 — props로 들어온 값을 그대로 보여줄 뿐이다. 최초 마운트
// 시점(턴 1 진입 등)에는 "변화"가 아니므로 펄스가 뜨지 않는다.
function AnimatedStatCard({ label, value, format }) {
  const prevValueRef = useRef(value)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value
      setPulse(true)
      const timer = setTimeout(() => setPulse(false), 700)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [value])

  return (
    <div className={pulse ? 'stat-card stat-card--pulse' : 'stat-card'}>
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value">{format ? format(value) : value}</span>
    </div>
  )
}

// Small in-game HUD shown at the top of every decision screen (7단계 스펙
// 2/8/9번), reusing the existing .stat-grid/.stat-card tiles so it visually
// matches FINAL RESULT's stat cards, plus a compact turn/progress row.
// ---- 9-2단계 강화: SELECTED MARKET/PRODUCT 정보 줄, CURRENT SCORE 스탯
// 카드, 완료/진행중/남음을 구분하는 TURN 트랙을 추가했다. 모든 값은 실제
// game state(props)에서만 가져오고, 기존 BUDGET/TRUST/MARKET FIT/
// AD EFFICIENCY 카드와 계산 방식은 전혀 건드리지 않는다. ----
// ---- 9-3단계 강화: 턴이 바뀌어도 이 컴포넌트 자체는 리마운트되지 않도록
// App()/MissionDecisionScreen에서 그대로 유지한 채 렌더링해, 값이 바뀌는
// 순간을 AnimatedStatCard가 감지해 짧게 강조할 수 있게 한다. ----
function MissionHUD({
  market,
  product,
  budget,
  buyerTrust,
  marketFit,
  adEfficiency,
  currentScore,
  turn,
  totalTurns,
}) {
  return (
    <div className="mission-hud">
      <div className="mission-hud__info">
        <span className="mission-hud__info-item">
          <MarketFlagIcon code={market.id} className="mission-hud__info-flag" />
          {market.name}
        </span>
        <span className="mission-hud__info-sep" aria-hidden="true">
          &bull;
        </span>
        <span className="mission-hud__info-item">{product.name}</span>
      </div>
      <div className="stat-grid mission-hud__grid">
        <AnimatedStatCard
          label={'\u{1F4B0} BUDGET'}
          value={budget}
          format={(v) => `₩${v.toLocaleString()}`}
        />
        <AnimatedStatCard label={'⭐ TRUST'} value={buyerTrust} />
        <AnimatedStatCard label={'\u{1F4C8} MARKET FIT'} value={marketFit} />
        <AnimatedStatCard label={'\u{1F4E3} AD EFFICIENCY'} value={adEfficiency} />
        <AnimatedStatCard label={'\u{1F3C6} SCORE'} value={currentScore} />
      </div>
      <div className="mission-hud__turn">
        <span className="mission-hud__turn-label">
          &#9889; TURN {turn} / {totalTurns}
        </span>
        <TurnProgressTrack turn={turn} totalTurns={totalTurns} />
      </div>
    </div>
  )
}

// One short, country + strategy flavored line for 7단계 스펙 13번 ("턴이
// 끝날 때 간단한 상태 변화 문구"). Picks the strategy's single biggest score
// swing to decide whether the buyer's reaction reads as positive or
// cautious, so the tone actually matches what just happened.
function getTurnSummary(option, effects, market) {
  const dominant = Object.entries(effects)
    .filter(([key]) => key !== 'profit' && key !== 'operations')
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]
  const positive = !dominant || dominant[1] >= 0
  const tone = positive ? '긍정적으로' : '신중하게'
  return `${market.nameKo} 바이어가 ${option.title} 선택에 ${tone} 반응했습니다.`
}

// Small floating "toast" that pops in right after a strategy is selected and
// fades out on its own via CSS animation (7단계 스펙 7번) — separate from,
// and in addition to, the existing persistent result-panel score list below.
function StrategyEffectToast({ option, effects, budgetDelta, market }) {
  const HUD_FIELD_LABELS = { marketFit: 'MARKET FIT', trust: 'BUYER TRUST', adEfficiency: 'AD EFFICIENCY' }
  const rows = Object.entries(HUD_FIELD_LABELS)
    .map(([key, label]) => ({ key, label, value: effects[key] ?? 0 }))
    .filter((row) => row.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 2)

  return (
    <div className="effect-toast" role="status">
      <span className="effect-toast__badge">STRATEGY EFFECT</span>
      <p className="effect-toast__summary">{getTurnSummary(option, effects, market)}</p>
      {rows.map((row) => (
        <div className="effect-toast__row" key={row.key}>
          <span>{row.label}</span>
          <span
            className={
              row.value > 0
                ? 'effect-toast__delta effect-toast__delta--up'
                : 'effect-toast__delta effect-toast__delta--down'
            }
          >
            {row.value > 0 ? `+${row.value}` : row.value} {row.value > 0 ? '↑' : '↓'}
          </span>
        </div>
      ))}
      {budgetDelta !== 0 && (
        <div className="effect-toast__row">
          <span>BUDGET</span>
          <span
            className={
              budgetDelta > 0
                ? 'effect-toast__delta effect-toast__delta--up'
                : 'effect-toast__delta effect-toast__delta--down'
            }
          >
            {budgetDelta > 0 ? '+' : '-'}&#8361;{Math.abs(budgetDelta).toLocaleString()}{' '}
            {budgetDelta > 0 ? '↑' : '↓'}
          </span>
        </div>
      )}
    </div>
  )
}

// ---- 9-2단계: 전략 카드에 "한눈에 보이는 주요 효과"를 보여주기 위한
// 순수 표시용 파생 함수. 실제 점수 계산(computeFinalEffects/
// applyStrategyEffect)에는 전혀 관여하지 않고, 이미 계산되어 있는 effects
// 중 절댓값이 큰 항목 최대 2개만 뽑아 라벨을 만든다. 추측으로 새 수치를
// 만들지 않고 실제 effects 값만 그대로 보여준다. ----
const CHOICE_KEY_EFFECT_LABELS = {
  marketFit: 'MARKET FIT',
  trust: 'BUYER TRUST',
  adEfficiency: 'AD EFFICIENCY',
  profit: 'PROFIT',
}
function getKeyEffects(effects) {
  return Object.entries(effects)
    .filter(([key, value]) => CHOICE_KEY_EFFECT_LABELS[key] && value !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2)
    .map(([key, value]) => ({
      key,
      label: CHOICE_KEY_EFFECT_LABELS[key],
      value,
    }))
}

function MissionDecisionScreen({
  roundIndex,
  totalRounds,
  round,
  market,
  product,
  budget,
  scores,
  onNext,
}) {
  // ---- 9-3단계: 턴이 바뀌면(roundIndex 변경) 이전 턴에 남아있던 선택이
  // 다음 턴 카드에 그대로 이어져 보이지 않아야 한다. useEffect로 다시
  // setState 하는 대신, "어느 라운드에서 무엇을 선택했는지"를 함께 저장해
  // 렌더링 중에 파생시킨다(선택/점수 판정 로직은 그대로). ----
  const [selection, setSelection] = useState(null)
  const selectedId = selection && selection.roundIndex === roundIndex ? selection.id : null

  const profile = MARKET_PROFILES[market.id]

  const choices = round.options.map((option) => {
    const { effects, notes, budgetPctAdjustment } = computeFinalEffects(option, round, market, product)
    return {
      ...option,
      effects,
      countryNotes: notes,
      budgetPct: (option.budgetPct ?? 0) + budgetPctAdjustment,
      keyEffects: getKeyEffects(effects),
    }
  })

  const selectedOption = choices.find((choice) => choice.id === selectedId) ?? null
  const feedback = selectedOption ? selectedOption.buyerFeedback(market, product) : null
  const isLastRound = roundIndex + 1 >= totalRounds
  const budgetDelta = selectedOption ? applyBudgetChange(budget, selectedOption.budgetPct) - budget : 0

  const handleSelect = (option) => {
    console.log(round.key, option.id)
    setSelection({ roundIndex, id: option.id })
  }

  return (
    <div className="decision-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="decision-card">
        {/* ---- 9-3단계: TURN 전환 연출 ----
            턴이 바뀔 때마다 roundIndex를 key로 삼아 제목/설명 블록만 짧게
            fade-in 시킨다. MissionHUD는 이 밖에 그대로 두어(리마운트되지
            않게) 값이 바뀌는 순간을 자체적으로 감지해 강조할 수 있게 한다. */}
        <div key={`head-${roundIndex}`} className="decision-turn-fade">
          <span className="price-step">
            DECISION {roundIndex + 1} / {totalRounds}
          </span>

          <h1 className="price-title">
            {round.icon} {round.title}
          </h1>

          <p className="price-lead">
            {market.name} · {product.name}
          </p>
        </div>

        <MissionHUD
          market={market}
          product={product}
          budget={budget}
          buyerTrust={scores.trust}
          marketFit={scores.marketFit}
          adEfficiency={scores.adEfficiency}
          currentScore={computeTotalScore(scores)}
          turn={roundIndex + 1}
          totalTurns={totalRounds}
        />

        {/* ---- 9-3단계: 턴 본문(목표/전략 카드/결과)도 roundIndex가 바뀌면
            함께 fade-in 되도록 같은 방식으로 묶는다. ---- */}
        <div key={`body-${roundIndex}`} className="decision-turn-fade">
        {/* ---- 9-2단계: 턴별 MISSION OBJECTIVE ----
            round.prompt(기존 STRATEGY_ROUNDS 데이터)를 그대로 사용해 "이번
            턴에 무엇을 결정해야 하는지"를 게임의 목표 패널처럼 보여준다.
            새로운 문구를 만들지 않고 기존 데이터만 재사용한다. */}
        <section className="mission-objective mission-objective--turn">
          <span className="mission-objective__badge">&#127919; MISSION OBJECTIVE</span>
          <p className="mission-objective__text">{round.prompt}</p>
        </section>

        <div className="choice-list">
          {choices.map((choice) => (
            <ChoiceCard
              key={choice.id}
              option={choice}
              selected={selectedId === choice.id}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {selectedOption && (
          <StrategyEffectToast
            key={selectedOption.id}
            option={selectedOption}
            effects={selectedOption.effects}
            budgetDelta={budgetDelta}
            market={market}
          />
        )}

        {selectedOption && (
          <section className="result-panel">
            <span className="result-panel__badge">선택 완료</span>
            <h2 className="result-panel__title">{selectedOption.title}</h2>
            <div className="result-panel__desc">
              {selectedOption.result.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <ul className="result-panel__scores">
              {Object.entries(selectedOption.effects)
                .filter(([, value]) => value !== 0)
                .map(([key, value]) => (
                  <li key={key}>
                    <span>{SCORE_LABELS[key]}</span>
                    <span
                      className={
                        value > 0
                          ? 'result-panel__delta result-panel__delta--up'
                          : 'result-panel__delta result-panel__delta--down'
                      }
                    >
                      {value > 0 ? `+${value}` : value}
                    </span>
                  </li>
                ))}
            </ul>
            {selectedOption.countryNotes.length > 0 && (
              <div className="result-panel__desc">
                {selectedOption.countryNotes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            )}
          </section>
        )}

        {selectedOption && feedback && (
          <section className="ai-feedback-panel">
            <span className="ai-feedback-panel__badge">
              &#129302; AI BUYER FEEDBACK
            </span>
            <p className="ai-feedback-panel__subtitle">
              &quot;선택한 전략을 {market.name} 바이어의 관점에서 분석합니다.&quot;
            </p>

            <div className="ai-feedback-panel__section">
              <span className="ai-feedback-panel__label">바이어 관심사</span>
              <div className="result-panel__desc">
                <p>{profile.buyerIntro}</p>
              </div>
            </div>

            <div className="ai-feedback-panel__section">
              <span className="ai-feedback-panel__label">전략</span>
              <span className="strategy-row__value">{feedback.strategy}</span>
            </div>

            <div className="ai-feedback-panel__section">
              <span className="ai-feedback-panel__label">
                AI BUYER FEEDBACK
              </span>
              <div className="result-panel__desc">
                {feedback.feedback.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>

            <div className="ai-feedback-panel__section">
              <span className="ai-feedback-panel__label">TRADE TIP</span>
              <div className="result-panel__desc">
                {feedback.tip.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
          </section>
        )}

        {selectedOption && (
          <button
            type="button"
            className="start-button"
            onClick={() => onNext(selectedOption)}
          >
            {isLastRound ? '바이어 반응 확인 →' : '다음 의사결정 →'}
          </button>
        )}
        </div>
      </main>
    </div>
  )
}

// ---- 8-1단계: BUYER RESPONSE (TURN 4 이후, FINAL RESULT 이전 화면) ----
// 아래 함수들은 기존 점수 계산(computeTotalScore/calculateFinalScore/
// applyStrategyEffect)과 기존 AI BUYER FEEDBACK 관련 함수(generateBuyerFeedback/
// buildBuyerAnalysisData/buildBuyerPrompt)를 전혀 건드리지 않는, 완전히 별개의
// 새 점수(BUYER INTEREST)와 새 화면(BuyerResponseScreen)이다. 실제 외부 AI
// API는 사용하지 않으며, 이미 게임에 있는 market/product/selections/scores
// 데이터만으로 결정론적으로 계산한다.

// BUYER INTEREST(0~100, 독립 점수) = 시장 적합도 + 바이어 신뢰도 + 수익성 +
// 광고효율(가중 합산) + 국가별 가중치(MARKET_PROFILES.scoreWeights 재사용) +
// 상품별 가중치(시장수요/경쟁도/현지화 난이도/광고 난이도) + 선택한 가격·거래
// 전략 보너스. 마지막에 clampValue로 0~100 정규화해 단순 합산으로 값이
// 튀지 않도록 한다. 특정 국가가 항상 유리하지 않도록 국가 가중치 폭은
// 작게(약 0~3점) 유지한다.
function calculateBuyerInterest(scores, market, product, selections) {
  const profile = MARKET_PROFILES[market.id]

  const base =
    scores.marketFit * 0.35 + scores.trust * 0.3 + scores.profit * 0.2 + scores.adEfficiency * 0.15

  const countryWeight = ((profile.scoreWeights.marketFit + profile.scoreWeights.trust) / 2 - 1) * 20

  let productWeight = 0
  if (product.demand === '높음') productWeight += 4
  if (product.demand === '낮음') productWeight -= 4
  if (product.competition === '낮음') productWeight += 4
  if (product.competition === '높음') productWeight -= 4
  if (product.localizationDifficulty === '낮음') productWeight += 2
  if (product.localizationDifficulty === '높음') productWeight -= 2
  if (product.adDifficulty === '낮음') productWeight += 2
  if (product.adDifficulty === '높음') productWeight -= 2

  let strategyWeight = 0
  if (selections.price === 'B') strategyWeight += 3
  if (selections.deal === 'A' || selections.deal === 'B') strategyWeight += 3

  const raw = base + countryWeight + productWeight + strategyWeight
  return clampValue(Math.round(raw), 0, 100)
}

// BUYER INTEREST 점수 구간별 라벨/아이콘/기본 문구 + 국가 특성을 살짝 얹은
// 문구를 함께 반환한다. 문구가 국가/게임 결과에 따라 조금씩 달라지도록
// MARKET_PROFILES의 emphasisLabel을 재사용한다.
function getBuyerInterestMessage(interestScore, market) {
  const profile = MARKET_PROFILES[market.id]

  let tier
  if (interestScore >= 80) {
    tier = { level: 'high', label: 'HIGH INTEREST', icon: '\u{1F7E2}', baseText: 'Your offer has strong potential in this market.' }
  } else if (interestScore >= 60) {
    tier = { level: 'moderate', label: 'MODERATE INTEREST', icon: '\u{1F7E1}', baseText: 'The buyer sees potential but has some concerns.' }
  } else if (interestScore >= 40) {
    tier = { level: 'low', label: 'LOW INTEREST', icon: '\u{1F7E0}', baseText: 'The buyer needs more convincing before moving forward.' }
  } else {
    tier = { level: 'verylow', label: 'VERY LOW INTEREST', icon: '\u{1F534}', baseText: "The current offer does not sufficiently meet the buyer's expectations." }
  }

  return {
    ...tier,
    text: `${tier.baseText} ${market.nameKo} 바이어는 특히 ${profile.emphasisLabel}에 주목하고 있습니다.`,
  }
}

// 바이어가 실제로 말하는 것 같은 짧은 코멘트. 무작위가 아니라 실제 결과
// (interestScore 구간)와 상품/국가 데이터로 결정된다.
function getBuyerComment(market, product, interestScore) {
  if (interestScore >= 80) {
    return `"We see strong potential in this market. The pricing and positioning are attractive." — ${market.nameKo} 바이어`
  }
  if (interestScore >= 60) {
    return product.moq >= 1000
      ? `"The product looks promising, but we'd like to discuss the MOQ." — ${market.nameKo} 바이어`
      : `"The product looks promising, and we'd like to move forward with a few adjustments." — ${market.nameKo} 바이어`
  }
  if (interestScore >= 40) {
    return `"We see potential, but the offer needs more work before we're convinced." — ${market.nameKo} 바이어`
  }
  return product.localizationDifficulty === '높음'
    ? `"The product needs stronger localization before we can proceed." — ${market.nameKo} 바이어`
    : `"The current offer does not sufficiently meet our expectations." — ${market.nameKo} 바이어`
}

// 바이어가 우려하는 요소를 실제 게임 데이터(상품 특성 + 선택한 전략 +
// 현재 점수)로부터 최대 2개까지 결정한다. 무작위 생성이 아니라, 각 후보의
// severity(심각도)를 계산해 가장 두드러지는 순서로 정렬 후 상위 2개만 뽑는다.
function getBuyerConcerns(product, selections, scores) {
  const candidates = []

  if (product.moq >= 1000) {
    candidates.push({ label: 'HIGH MOQ', text: '요구 MOQ가 높아 초기 발주 부담이 큽니다.', severity: Math.min(100, Math.round(product.moq / 30)) })
  }
  if (selections.price === 'C' && product.competition === '높음') {
    candidates.push({ label: 'PRICE COMPETITIVENESS', text: '경쟁이 치열한 시장에서 가격 경쟁력이 부족합니다.', severity: 75 })
  }
  if (product.localizationDifficulty === '높음' && selections.localization === 'A') {
    candidates.push({ label: 'LOW LOCALIZATION', text: '현지화 수준이 이 시장의 요구에 비해 부족합니다.', severity: 80 })
  } else if (product.localizationDifficulty === '높음') {
    candidates.push({ label: 'LOW LOCALIZATION', text: '현지화 난이도가 높아 추가 대응이 필요합니다.', severity: 45 })
  }
  if (product.competition === '높음') {
    candidates.push({ label: 'HIGH COMPETITION', text: '경쟁이 치열한 카테고리입니다.', severity: 50 })
  }
  if (scores.adEfficiency < 55) {
    candidates.push({ label: 'LIMITED BRAND AWARENESS', text: '광고 효율이 낮아 브랜드 인지도 확보가 더딥니다.', severity: 100 - scores.adEfficiency })
  }

  return candidates.sort((a, b) => b.severity - a.severity).slice(0, 2)
}

// 바이어가 긍정적으로 평가하는 요소를 실제 게임 데이터로부터 최대 2개까지
// 결정한다. 후보가 하나도 없으면 상품 자체의 잠재력을 기본값으로 보여준다.
function getBuyerPositives(scores, selections) {
  const candidates = []

  if (scores.marketFit >= 70) {
    candidates.push({ label: 'STRONG MARKET FIT', text: '시장 적합성이 높게 평가되었습니다.', severity: scores.marketFit })
  }
  if (selections.price === 'A' || selections.price === 'B') {
    candidates.push({ label: 'COMPETITIVE PRICE', text: '가격 경쟁력이 우수합니다.', severity: selections.price === 'A' ? 70 : 60 })
  }
  if (scores.adEfficiency >= 70) {
    candidates.push({ label: 'EFFECTIVE ADVERTISING', text: '광고 전략이 효과적으로 작동했습니다.', severity: scores.adEfficiency })
  }
  if (scores.trust >= 65) {
    candidates.push({ label: 'HIGH BUYER TRUST', text: '바이어 신뢰도가 높습니다.', severity: scores.trust })
  }

  if (candidates.length === 0) {
    candidates.push({ label: 'GOOD PRODUCT POTENTIAL', text: '상품 자체의 잠재력이 긍정적으로 평가되었습니다.', severity: 50 })
  }

  return candidates.sort((a, b) => b.severity - a.severity).slice(0, 2)
}

// TURN 4 직후, FINAL RESULT 이전에 표시되는 새 화면. 기존 .buyer-screen/
// .buyer-card(App.css에 이미 정의돼 있었지만 미사용이던 클래스)와
// .total-score/.mission-badge/.reaction-panel/.stat-grid/.ai-feedback-panel/
// .start-button을 그대로 재사용해 새 CSS 없이 기존 디자인과 통일한다.
function BuyerResponseScreen({ market, product, scores, selections, onContinue }) {
  const interestScore = calculateBuyerInterest(scores, market, product, selections)
  const tier = getBuyerInterestMessage(interestScore, market)
  const comment = getBuyerComment(market, product, interestScore)
  const concerns = getBuyerConcerns(product, selections, scores)
  const positives = getBuyerPositives(scores, selections)

  return (
    <div className="buyer-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="buyer-card">
        <span className="price-step">BUYER RESPONSE</span>

        <h1 className="price-title">&#129309; BUYER RESPONSE</h1>
        <p className="price-lead">THE BUYER HAS REVIEWED YOUR OFFER</p>

        <h2 className="mission-title">
          <MarketFlagIcon code={market.id} className="mission-title__flag" />
          {market.name}
        </h2>
        <p className="price-lead">{product.name}</p>

        <div className="total-score">
          <span className="total-score__label">BUYER INTEREST</span>
          <span className="total-score__value">
            {interestScore}
            <span className="total-score__max"> / 100</span>
          </span>
        </div>

        <span className="mission-badge">
          {tier.icon} {tier.label}
        </span>

        <div className="reaction-panel">
          <p>{tier.text}</p>
        </div>

        <div className="stat-grid mission-hud__grid">
          <div className="stat-card">
            <span className="stat-card__label">&#11088; BUYER TRUST</span>
            <span className="stat-card__value">{scores.trust} / 100</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">&#128200; MARKET FIT</span>
            <span className="stat-card__value">{scores.marketFit} / 100</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">PRICE</span>
            <span className="stat-card__value">&#8361;{product.price.toLocaleString()}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">MOQ</span>
            <span className="stat-card__value">{product.moq.toLocaleString()} units</span>
          </div>
        </div>

        <section className="ai-feedback-panel">
          <span className="ai-feedback-panel__badge">BUYER COMMENT</span>
          <p className="ai-feedback-panel__subtitle">{comment}</p>

          {positives.length > 0 && (
            <div className="ai-feedback-panel__section">
              <span className="ai-feedback-panel__label">POSITIVE POINTS</span>
              <div className="result-panel__desc">
                {positives.map((p) => (
                  <p key={p.label}>&#10003; {p.label} — {p.text}</p>
                ))}
              </div>
            </div>
          )}

          {concerns.length > 0 && (
            <div className="ai-feedback-panel__section">
              <span className="ai-feedback-panel__label">CONCERNS</span>
              <div className="result-panel__desc">
                {concerns.map((c) => (
                  <p key={c.label}>&#9888; {c.label} — {c.text}</p>
                ))}
              </div>
            </div>
          )}
        </section>

        <button type="button" className="start-button" onClick={onContinue}>
          SEE BUYER&apos;S NEXT MOVE &#8594;
        </button>
      </main>
    </div>
  )
}

// ---- 8-2단계: BUYER'S NEXT MOVE + CONTRACT OUTCOME ----
// BUYER RESPONSE와 FINAL RESULT 사이에 새로 들어가는 두 화면이다. 기존
// calculateFinalScore/computeTotalScore/applyStrategyEffect, 그리고 8-1의
// calculateBuyerInterest/getBuyerInterestMessage/getBuyerConcerns 등은 전혀
// 수정하지 않고 그대로 재사용하며, 실제 외부 AI API는 사용하지 않는다.
// 모든 결과는 Math.random 없이 게임 상태(시장/상품/선택/점수/행동)만으로
// 결정론적으로 계산되어, 같은 상태 + 같은 선택이면 항상 같은 결과가 나온다.

// BUYER INTEREST 구간(getBuyerInterestMessage의 tier.level 재사용)별로
// BUYER'S NEXT MOVE에서 보여줄 상황 설명과 선택지를 정의한다.
const BUYER_NEXT_MOVE_SITUATION = {
  high: 'The buyer is highly interested in your offer and is ready to move toward a deal.',
  moderate: 'The buyer sees potential but wants better conditions before moving forward.',
  low: 'The buyer has concerns about your current offer.',
  verylow: 'The buyer is not convinced by the current offer.',
}

const BUYER_NEXT_MOVE_OPTIONS = {
  high: [
    { id: 'accept_offer', label: 'ACCEPT OFFER' },
    { id: 'request_sample', label: 'REQUEST SAMPLE' },
    { id: 'negotiate_moq', label: 'NEGOTIATE MOQ' },
  ],
  moderate: [
    { id: 'negotiate_price', label: 'NEGOTIATE PRICE' },
    { id: 'request_sample', label: 'REQUEST SAMPLE' },
    { id: 'improve_localization', label: 'IMPROVE LOCALIZATION' },
  ],
  low: [
    { id: 'revise_offer', label: 'REVISE OFFER' },
    { id: 'lower_moq', label: 'LOWER MOQ' },
    { id: 'improve_localization', label: 'IMPROVE LOCALIZATION' },
  ],
  verylow: [
    { id: 'final_offer', label: 'MAKE A FINAL OFFER' },
    { id: 'lower_price', label: 'LOWER PRICE' },
    { id: 'walk_away', label: 'WALK AWAY' },
  ],
}

// BUYER INTEREST 구간(80/60/40)에 따라 성사 시 주문량을 합리적으로 정한다.
// 관심도가 높을수록 MOQ보다 더 큰 주문으로 이어진다는 가정.
function calculateContractOrderQuantity(product, buyerInterest) {
  const multiplier = buyerInterest >= 90 ? 1.5 : buyerInterest >= 80 ? 1.2 : 1
  return Math.round((product.moq * multiplier) / 10) * 10
}

// CONTRACT OUTCOME이 DEAL REJECTED일 때 보여줄 결렬 사유를 최대 2개
// 결정한다. 8-1의 getBuyerConcerns()와 같은 방식(후보 severity 정렬)이지만,
// 계약 단계에서 의미 있는 LOW MARKET FIT/LOW BUYER TRUST를 추가로 고려한다.
// getBuyerConcerns() 자체는 수정하지 않는다.
function getContractRejectionReasons(product, selections, scores) {
  const candidates = []

  if (product.moq >= 1000) {
    candidates.push({ label: 'HIGH MOQ', text: '요구 MOQ가 예상보다 높아 발주 결정을 내리기 어려웠습니다.', severity: Math.min(100, Math.round(product.moq / 30)) })
  }
  if (selections.price === 'C' && product.competition === '높음') {
    candidates.push({ label: 'PRICE COMPETITION', text: '경쟁이 치열한 시장에서 가격 경쟁력이 부족했습니다.', severity: 75 })
  }
  if (product.localizationDifficulty === '높음' && selections.localization === 'A') {
    candidates.push({ label: 'LOW LOCALIZATION', text: '현지화 수준이 이 시장의 요구에 미치지 못했습니다.', severity: 70 })
  }
  if (scores.marketFit < 55) {
    candidates.push({ label: 'LOW MARKET FIT', text: '시장 적합성이 기대에 미치지 못했습니다.', severity: 100 - scores.marketFit })
  }
  if (scores.trust < 55) {
    candidates.push({ label: 'LOW BUYER TRUST', text: '바이어 신뢰도가 충분히 쌓이지 못했습니다.', severity: 100 - scores.trust })
  }
  if (candidates.length === 0) {
    candidates.push({ label: 'OVERALL FIT', text: '전반적인 제안 조건이 바이어의 기대에 충분히 부합하지 못했습니다.', severity: 50 })
  }

  return candidates.sort((a, b) => b.severity - a.severity).slice(0, 2)
}

// BUYER'S NEXT MOVE에서 고른 행동(actionId)을 반영해 계약 결과를 결정론적
// 으로 계산한다. BUYER INTEREST(이미 marketFit/trust/profit/adEfficiency/
// 국가/상품/전략을 반영한 값)를 기준으로, 행동별 보정값 + 국가·상품 맥락을
// 더해 0~100 dealScore를 만들고, 구간에 따라 success/continues/rejected를
// 정한다. Math.random을 쓰지 않으므로 같은 입력이면 항상 같은 결과다.
function calculateContractOutcome(buyerInterest, scores, market, product, selections, actionId) {
  const profile = MARKET_PROFILES[market.id]

  let delta = 0
  let capContinues = false
  let forcedRejected = false

  switch (actionId) {
    case 'accept_offer':
      delta = 10
      break
    case 'negotiate_moq':
      delta = scores.trust >= 60 ? 8 : -8
      break
    case 'negotiate_price':
      delta = selections.price === 'C' ? 10 : 4
      break
    case 'improve_localization':
      delta = product.localizationDifficulty === '높음' ? 10 : 5
      break
    case 'revise_offer':
      delta = 8
      break
    case 'lower_moq':
      delta = product.moq >= 1000 ? 10 : 4
      break
    case 'final_offer':
      delta = 6
      break
    case 'lower_price':
      delta = selections.price === 'C' ? 10 : 5
      break
    case 'request_sample':
      delta = 5
      capContinues = true
      break
    case 'walk_away':
      forcedRejected = true
      break
    default:
      delta = 0
  }

  let contextAdjustment = 0
  if (product.competition === '높음') contextAdjustment -= 3
  if (product.demand === '높음') contextAdjustment += 3
  contextAdjustment += Math.round(((profile.scoreWeights.trust + profile.scoreWeights.marketFit) / 2 - 1) * 10)

  const dealScore = clampValue(Math.round(buyerInterest + delta + contextAdjustment), 0, 100)

  let outcome
  if (forcedRejected) {
    outcome = 'rejected'
  } else if (dealScore >= 70) {
    outcome = capContinues ? 'continues' : 'success'
  } else if (dealScore >= 45) {
    outcome = 'continues'
  } else {
    outcome = 'rejected'
  }

  const orderQuantity = outcome === 'success' ? calculateContractOrderQuantity(product, buyerInterest) : 0
  const rejectionReasons = outcome === 'rejected' ? getContractRejectionReasons(product, selections, scores) : []

  return { outcome, dealScore, orderQuantity, rejectionReasons }
}

// 기존 calculateFinalScore()는 전혀 건드리지 않고, 그 결과에 계약 결과를
// 작은 폭(±6)으로만 더해 0~100으로 다시 정규화한다. 기존 FINAL SCORE 계산
// 시스템을 대체하는 것이 아니라, 그 위에 계약 결과를 얹는 방식이다.
function applyContractOutcomeToScore(baseScore, outcome) {
  let bonus = 0
  if (outcome === 'success') bonus = 6
  else if (outcome === 'continues') bonus = 2
  else if (outcome === 'rejected') bonus = -6
  return clampValue(baseScore + bonus, 0, 100)
}

// ---- 8-3단계: EXPORT PERFORMANCE (FINAL RESULT 화면 내 카드) ----
// CONTRACT OUTCOME(8-2)의 결과를 실제 수출 거래 숫자로 환산해서 보여준다.
// 기존 calculateContractOutcome/calculateFinalScore/applyContractOutcomeToScore는
// 전혀 수정하지 않고, 그 결과값(outcome, orderQuantity 등)을 그대로 입력으로
// 받아 파생 계산만 추가한다. Math.random을 쓰지 않으므로 같은 국가+상품+
// 전략 선택+BUYER DECISION이면 항상 같은 숫자가 나온다.

// NEGOTIATION CONTINUES 상태에서 보여줄 "잠재" 주문량. calculateContractOutcome은
// continues일 때 orderQuantity를 0으로 두므로(아직 확정 계약이 아니라서),
// 여기서는 별도로 BUYER INTEREST 구간에 따라 MOQ의 0.5~1.0배 범위로
// 잠재 주문량만 계산한다. 기존 calculateContractOrderQuantity(성사 시
// 1.0~1.5배)는 건드리지 않는다.
function calculatePotentialOrderQuantity(product, buyerInterest) {
  const multiplier = buyerInterest >= 60 ? 1 : buyerInterest >= 45 ? 0.75 : 0.5
  return Math.round((product.moq * multiplier) / 10) * 10
}

// 실제 원가 데이터가 게임에 없으므로, 이미 계산되어 있는 수익성 점수
// (scores.profit)를 기반으로 일관된 원가율을 만든다. profit 점수가 높을수록
// 원가율이 낮아지고(마진이 커지고), 낮을수록 원가율이 높아진다(마진이
// 줄어든다). 0~100 범위를 벗어난 profit 값이 들어와도 방어적으로 clamp한다.
// 순수 함수이며 Math.random을 쓰지 않는다.
function calculateCostRatio(profitScore) {
  const clampedProfit = clampValue(profitScore, 0, 100)
  const ratio = 0.82 - (clampedProfit - 50) * 0.004
  return clampValue(ratio, 0.55, 0.95)
}

// CONTRACT OUTCOME(계약 결과) + BUYER INTEREST + 현재 점수/상품 데이터를
// 실제 수출 성과 숫자(주문량/단가/계약금액/추정원가/추정이익/마진 등)로
// 환산한다. contractResult(outcome/orderQuantity)는 8-2에서 이미 계산된
// 값을 그대로 재사용하며, 여기서 중복으로 다시 계산하지 않는다.
function calculateExportPerformance(contractResult, buyerInterest, scores, product) {
  const unitPrice = product.price
  const isPotential = contractResult.outcome === 'continues'

  let orderQuantity = 0
  if (contractResult.outcome === 'success') {
    // 8-2에서 이미 계산된 확정 주문량(MOQ의 1.0~1.5배)을 그대로 사용한다.
    orderQuantity = contractResult.orderQuantity
  } else if (contractResult.outcome === 'continues') {
    orderQuantity = calculatePotentialOrderQuantity(product, buyerInterest)
  }

  const contractValue = orderQuantity * unitPrice
  const costRatio = calculateCostRatio(scores.profit)
  const estimatedCost = contractValue > 0 ? Math.round(contractValue * costRatio) : 0
  const estimatedProfit = contractValue > 0 ? contractValue - estimatedCost : 0
  const profitMargin = contractValue > 0 ? Math.round((estimatedProfit / contractValue) * 1000) / 10 : 0

  const exportStatus =
    contractResult.outcome === 'success'
      ? 'EXPORT CONFIRMED'
      : contractResult.outcome === 'continues'
        ? 'NEGOTIATION'
        : 'DEAL LOST'

  // DEAL REJECTED일 때만 "성사됐다면 얻을 수 있었던" 잠재 계약가치를 참고용으로
  // 보여준다. 실제 계약으로 표현하지 않기 위해 orderQuantity/contractValue와는
  // 분리된 별도 필드(lostOpportunity)로만 노출한다.
  const lostOpportunity =
    contractResult.outcome === 'rejected'
      ? calculateContractOrderQuantity(product, buyerInterest) * unitPrice
      : 0

  return {
    exportStatus,
    orderQuantity,
    unitPrice,
    contractValue,
    estimatedCost,
    estimatedProfit,
    profitMargin,
    buyerTrust: scores.trust,
    marketFit: scores.marketFit,
    isPotential,
    lostOpportunity,
  }
}

// TURN 4 → BUYER RESPONSE 다음, CONTRACT OUTCOME 이전에 표시되는 화면.
// 기존 .buyer-screen/.buyer-card/.mission-badge/.reaction-panel/.choice-list/
// .start-button을 그대로 재사용해 새 CSS 없이 기존 디자인과 통일한다.
function BuyerNextMoveScreen({ market, product, scores, selections, onSelect }) {
  const interestScore = calculateBuyerInterest(scores, market, product, selections)
  const tier = getBuyerInterestMessage(interestScore, market)
  const options = BUYER_NEXT_MOVE_OPTIONS[tier.level]
  const situation = BUYER_NEXT_MOVE_SITUATION[tier.level]

  return (
    <div className="buyer-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="buyer-card">
        <span className="price-step">BUYER&apos;S NEXT MOVE</span>

        <h1 className="price-title">BUYER&apos;S NEXT MOVE</h1>
        <p className="price-lead">HOW WILL YOU RESPOND?</p>

        <span className="mission-badge">
          {tier.icon} {tier.label}
        </span>

        <div className="reaction-panel">
          <p>{situation}</p>
        </div>

        <div className="choice-list">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="start-button"
              onClick={() => onSelect(option.id, tier.level)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}

// BUYER'S NEXT MOVE에서 행동을 고른 직후, FINAL RESULT로 바로 가지 않고
// 계약 결과를 짧게 보여주는 화면. 기존 .performance-screen/.performance-card
// (미사용이던 클래스)와 .mission-badge/.reaction-panel/.mission-info/
// .result-panel/.start-button을 재사용한다.
function ContractOutcomeScreen({ market, product, contractResult, onContinue }) {
  const { outcome, orderQuantity, rejectionReasons } = contractResult

  const outcomeMeta = {
    success: { icon: '\u{1F7E2}', label: 'DEAL SUCCESSFUL', text: 'The buyer has accepted your offer.' },
    continues: {
      icon: '\u{1F7E1}',
      label: 'NEGOTIATION CONTINUES',
      text: 'The buyer is interested, but additional negotiation is required.',
    },
    rejected: {
      icon: '\u{1F534}',
      label: 'DEAL REJECTED',
      text: 'The buyer decided not to proceed with the current offer.',
    },
  }[outcome]

  return (
    <div className="performance-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="performance-card">
        <span className="price-step">CONTRACT OUTCOME</span>

        <h1 className="price-title">CONTRACT OUTCOME</h1>

        <span className="mission-badge">
          {outcomeMeta.icon} {outcomeMeta.label}
        </span>

        <div className="reaction-panel">
          <p>{outcomeMeta.text}</p>
        </div>

        {outcome === 'success' && (
          <dl className="mission-info">
            <div className="mission-info__row">
              <dt>BUYER</dt>
              <dd>{market.nameKo} 바이어</dd>
            </div>
            <div className="mission-info__row">
              <dt>PRODUCT</dt>
              <dd>{product.name}</dd>
            </div>
            <div className="mission-info__row">
              <dt>ORDER</dt>
              <dd>{orderQuantity.toLocaleString()} units</dd>
            </div>
            <div className="mission-info__row">
              <dt>STATUS</dt>
              <dd>CONFIRMED</dd>
            </div>
          </dl>
        )}

        {outcome === 'rejected' && rejectionReasons.length > 0 && (
          <section className="result-panel">
            <span className="result-panel__badge">WHAT WENT WRONG</span>
            <div className="result-panel__desc">
              {rejectionReasons.map((reason) => (
                <p key={reason.label}>&#9888; {reason.label} — {reason.text}</p>
              ))}
            </div>
          </section>
        )}

        <button type="button" className="start-button" onClick={onContinue}>
          CONTINUE TO FINAL RESULT &#8594;
        </button>
      </main>
    </div>
  )
}

function FinalResultScreen({ scores, market, product, selections, budget, initialBudget, onPlayAgain, contractResult }) {
  // 8-2단계: 기존 calculateFinalScore()는 그대로 두고(baseTotalScore), 그
  // 결과에 CONTRACT OUTCOME을 작은 폭으로 결합한 값을 실제 FINAL RESULT의
  // TOTAL SCORE로 사용한다. contractOutcome이 없으면(이론상 도달 불가하지만
  // 방어적으로) 기존 점수를 그대로 쓴다.
  const contractOutcome = contractResult ? contractResult.outcome : null
  const baseTotalScore = calculateFinalScore(scores, budget, initialBudget)
  const totalScore = contractOutcome ? applyContractOutcomeToScore(baseTotalScore, contractOutcome) : baseTotalScore

  // 8-3단계: EXPORT PERFORMANCE. BUYER INTEREST는 8-1의 calculateBuyerInterest를
  // 그대로 재사용(재계산 방식 변경 없음)하고, contractResult(8-2에서 이미 계산된
  // outcome/orderQuantity)를 그대로 입력으로 넘겨 중복 계산 없이 파생값만 만든다.
  const buyerInterestScore = calculateBuyerInterest(scores, market, product, selections)
  const exportPerformance = contractResult
    ? calculateExportPerformance(contractResult, buyerInterestScore, scores, product)
    : null

  let resultLines
  if (totalScore >= 80) {
    resultLines = [`${market.name} 시장 진출 전략을 성공적으로 설계했습니다.`]
  } else if (totalScore >= 60) {
    resultLines = ['안정적인 전략을 구성했지만,', '일부 개선할 부분이 있습니다.']
  } else {
    resultLines = [`${market.name} 시장 진출 과정에서`, '추가적인 전략 조정이 필요합니다.']
  }

  const strategyRows = STRATEGY_ROUNDS.map((round) => {
    const option = round.options.find((o) => o.id === selections[round.key])
    return { key: round.key, label: round.resultLabel, title: option ? option.title : '-' }
  })

  const buyerFeedback = generateBuyerFeedback(market, product, selections, totalScore)

  // 7-2단계: 실제 게임 데이터를 AI 분석용 구조/프롬프트로 변환해본다.
  // 실제 API 호출은 하지 않으며, 기존 AI BUYER FEEDBACK UI(위 buyerFeedback)나
  // FINAL RESULT 화면 렌더링에는 아무 영향이 없다 — 콘솔 확인용 배선이다.
  const buyerAnalysisData = buildBuyerAnalysisData(market, product, selections, scores, budget, totalScore)
  console.log('AI BUYER ANALYSIS DATA', buyerAnalysisData)
  console.log('AI BUYER PROMPT', buildBuyerPrompt(buyerAnalysisData))

  return (
    <div className="final-result-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="final-result-card">
        <span className="price-step">07 / 07</span>

        <h1 className="price-title">FINAL RESULT</h1>

        <span className="mission-badge">{market.name} MARKET PERFORMANCE</span>

        <p className="price-lead">{market.name} 시장 진출 전략이 완료되었습니다.</p>

        <div className="stat-grid">
          {Object.entries(SCORE_LABELS).map(([key, label]) => (
            <div key={key} className="stat-card">
              <span className="stat-card__label">{label}</span>
              <span className="stat-card__value">
                {scores[key] >= 0 ? `+${scores[key]}` : scores[key]}
              </span>
            </div>
          ))}
        </div>

        <div className="total-score">
          <span className="total-score__label">TOTAL SCORE</span>
          <span className="total-score__value">
            {totalScore}
            <span className="total-score__max"> / 100</span>
          </span>
        </div>

        {contractOutcome && (
          <span className="mission-badge">
            {contractOutcome === 'success' && '\u{1F7E2} DEAL SUCCESSFUL'}
            {contractOutcome === 'continues' && '\u{1F7E1} NEGOTIATION CONTINUES'}
            {contractOutcome === 'rejected' && '\u{1F534} DEAL REJECTED'}
          </span>
        )}

        {exportPerformance && (
          <section className="result-panel">
            <span className="result-panel__badge">&#128230; EXPORT PERFORMANCE</span>
            <dl className="mission-info">
              <div className="mission-info__row">
                <dt>EXPORT STATUS</dt>
                <dd>{exportPerformance.exportStatus}</dd>
              </div>

              <div className="mission-info__row">
                <dt>{exportPerformance.isPotential ? 'POTENTIAL ORDER' : 'ORDER QUANTITY'}</dt>
                <dd>{exportPerformance.orderQuantity.toLocaleString()} units</dd>
              </div>

              {contractOutcome !== 'rejected' && (
                <div className="mission-info__row">
                  <dt>UNIT PRICE</dt>
                  <dd>&#8361;{exportPerformance.unitPrice.toLocaleString()}</dd>
                </div>
              )}

              <div className="mission-info__row">
                <dt>{exportPerformance.isPotential ? 'POTENTIAL CONTRACT VALUE' : 'CONTRACT VALUE'}</dt>
                <dd>&#8361;{exportPerformance.contractValue.toLocaleString()}</dd>
              </div>

              {contractOutcome !== 'rejected' && (
                <div className="mission-info__row">
                  <dt>ESTIMATED COST</dt>
                  <dd>&#8361;{exportPerformance.estimatedCost.toLocaleString()}</dd>
                </div>
              )}

              <div className="mission-info__row">
                <dt>{exportPerformance.isPotential ? 'POTENTIAL PROFIT' : 'ESTIMATED PROFIT'}</dt>
                <dd>&#8361;{exportPerformance.estimatedProfit.toLocaleString()}</dd>
              </div>

              {contractOutcome === 'success' && (
                <div className="mission-info__row">
                  <dt>PROFIT MARGIN</dt>
                  <dd>{exportPerformance.profitMargin}%</dd>
                </div>
              )}

              {contractOutcome === 'rejected' && exportPerformance.lostOpportunity > 0 && (
                <div className="mission-info__row">
                  <dt>LOST OPPORTUNITY</dt>
                  <dd>&#8361;{exportPerformance.lostOpportunity.toLocaleString()}</dd>
                </div>
              )}
            </dl>

            <dl className="mission-info">
              <div className="mission-info__row">
                <dt>&#129309; BUYER TRUST</dt>
                <dd>{exportPerformance.buyerTrust} / 100</dd>
              </div>
              <div className="mission-info__row">
                <dt>&#128200; MARKET FIT</dt>
                <dd>{exportPerformance.marketFit} / 100</dd>
              </div>
            </dl>
          </section>
        )}

        <div className="final-market-status">
          <span className="price-step">FINAL MARKET STATUS</span>
          <div className="stat-grid mission-hud__grid">
            <div className="stat-card">
              <span className="stat-card__label">&#128176; Remaining Budget</span>
              <span className="stat-card__value">&#8361;{budget.toLocaleString()}</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">&#11088; Buyer Trust</span>
              <span className="stat-card__value">{scores.trust} / 100</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">&#128200; Market Fit</span>
              <span className="stat-card__value">{scores.marketFit} / 100</span>
            </div>
            <div className="stat-card">
              <span className="stat-card__label">&#128227; Ad Efficiency</span>
              <span className="stat-card__value">{scores.adEfficiency} / 100</span>
            </div>
          </div>
        </div>

        <div className="reaction-panel">
          {resultLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <div className="strategy-summary">
          <span className="price-step">YOUR STRATEGY</span>
          <div className="strategy-list">
            <div className="strategy-row">
              <span className="strategy-row__label">상품</span>
              <span className="strategy-row__value">{product ? product.name : '-'}</span>
            </div>
            {strategyRows.map((row) => (
              <div className="strategy-row" key={row.key}>
                <span className="strategy-row__label">{row.label}</span>
                <span className="strategy-row__value">{row.title}</span>
              </div>
            ))}
          </div>
        </div>

        <section className="ai-feedback-panel">
          <span className="ai-feedback-panel__badge">
            &#129302; AI BUYER FEEDBACK
          </span>
          <p className="ai-feedback-panel__subtitle">
            &quot;{market.nameKo} 바이어의 관점에서 {product.name}을(를) 종합 평가합니다.&quot;
          </p>

          <div className="ai-feedback-panel__section">
            <span className="ai-feedback-panel__label">종합 피드백</span>
            <div className="result-panel__desc">
              {buyerFeedback.overallFeedback.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>

          <div className="ai-feedback-panel__section">
            <span className="ai-feedback-panel__label">상품의 강점</span>
            <div className="result-panel__desc">
              {buyerFeedback.strengths.map((line) => (
                <p key={line}>&#8226; {line}</p>
              ))}
            </div>
          </div>

          <div className="ai-feedback-panel__section">
            <span className="ai-feedback-panel__label">개선이 필요한 부분</span>
            <div className="result-panel__desc">
              {buyerFeedback.improvements.map((line) => (
                <p key={line}>&#8226; {line}</p>
              ))}
            </div>
          </div>

          <div className="ai-feedback-panel__section">
            <span className="ai-feedback-panel__label">구매를 고려할 이유</span>
            <div className="result-panel__desc">
              {buyerFeedback.reasonsToBuy.map((line) => (
                <p key={line}>&#8226; {line}</p>
              ))}
            </div>
          </div>

          <div className="ai-feedback-panel__section">
            <span className="ai-feedback-panel__label">수출 시 주의할 점</span>
            <div className="result-panel__desc">
              {buyerFeedback.exportCautions.map((line) => (
                <p key={line}>&#8226; {line}</p>
              ))}
            </div>
          </div>

          <div className="ai-feedback-panel__section">
            <span className="ai-feedback-panel__label">한줄 바이어 코멘트</span>
            <p className="ai-feedback-panel__subtitle">{buyerFeedback.oneLineComment}</p>
          </div>
        </section>

        <button type="button" className="start-button" onClick={onPlayAgain}>
          PLAY AGAIN
        </button>
      </main>
    </div>
  )
}

// ---- 7단계: AI BUYER FEEDBACK (FINAL RESULT 화면 내 섹션) ----
// 아래 함수는 기존 MissionDecisionScreen의 라운드별
// `.ai-feedback-panel`/`buyerFeedback()` 메커니즘과는 완전히 분리된 새로운
// 기능이며, 그 기존 메커니즘은 전혀 수정하지 않는다. 실제 API 연동 없이
// 게임에서 이미 수집된 값(선택한 국가/상품의 판매가격·MOQ·시장수요·
// 경쟁도·현지화 난이도·광고 난이도/선택한 4가지 전략/최종 점수)만으로
// 국가와 상품에 따라 달라지는 결정론적인 피드백을 생성한다.

// STRATEGY_ROUNDS + selections에서 라운드별로 선택된 옵션의 제목을 찾는다.
// FinalResultScreen의 strategyRows와 같은 소스 데이터를 쓰지만, 기존
// FinalResultScreen 코드는 건드리지 않기 위해 별도 헬퍼로 둔다.
function getSelectedStrategyTitle(round, selections) {
  const option = round.options.find((o) => o.id === selections[round.key])
  return option ? option.title : '-'
}

// 해외 바이어의 관점에서 상품/시장/선택한 전략/최종 점수를 평가하는
// 결정론적 피드백 생성기. 실제 API 호출은 하지 않고, 이미 게임 안에 있는
// 데이터만으로 국가(MARKET_PROFILES)와 상품 특성에 따라 달라지는 규칙
// 기반 텍스트를 구성한다. 요청된 6가지 항목(종합 피드백/강점/개선점/
// 구매 이유/수출 주의점/한줄 코멘트)을 모두 반환한다.
function generateBuyerFeedback(market, product, selections, totalScore) {
  const profile = MARKET_PROFILES[market.id]
  const strategyTitles = STRATEGY_ROUNDS.reduce((acc, round) => {
    acc[round.key] = getSelectedStrategyTitle(round, selections)
    return acc
  }, {})

  let verdict
  if (totalScore >= 80) {
    verdict = 'strong'
  } else if (totalScore >= 60) {
    verdict = 'moderate'
  } else {
    verdict = 'weak'
  }

  // 1. 바이어 관점의 종합 피드백
  const overallFeedback = [
    `${market.nameKo}(${market.name}) 바이어의 시각에서 ${product.name}을(를) 종합 평가했습니다.`,
    profile.buyerIntro,
    verdict === 'strong'
      ? `최종 점수 ${totalScore}점으로, 이 조건이라면 정식 거래를 적극적으로 검토할 만합니다.`
      : verdict === 'moderate'
        ? `최종 점수 ${totalScore}점으로, 소량 테스트 주문부터 시작해볼 만한 수준입니다.`
        : `최종 점수 ${totalScore}점으로, 정식 거래 전에 전략 재조정이 필요해 보입니다.`,
  ]

  // 2. 상품의 강점 (시장수요/경쟁도/현지화 난이도/광고 난이도 + 선택한 거래 전략)
  const strengths = []
  if (product.demand === '높음') {
    strengths.push(`시장수요가 높은 상품이라 ${market.nameKo} 진입 초기부터 구매 전환을 기대할 수 있습니다.`)
  }
  if (product.competition === '낮음') {
    strengths.push('경쟁도가 낮아 별다른 진입 장벽 없이 시장에 안착할 수 있습니다.')
  }
  if (product.localizationDifficulty === '낮음') {
    strengths.push('현지화 부담이 적어 빠른 시장 대응이 가능합니다.')
  }
  if (product.adDifficulty === '낮음') {
    strengths.push('광고 난이도가 낮아 비교적 적은 예산으로도 노출 효과를 기대할 수 있습니다.')
  }
  if (selections.deal === 'A' && product.moq >= 1000) {
    strengths.push(`MOQ ${product.moq.toLocaleString()}개인 상품에서 MOQ를 낮춘 선택이 첫 거래 성사 가능성을 높였습니다.`)
  }
  if (strengths.length === 0) {
    strengths.push(`선택한 전략이 ${profile.emphasisLabel} 중심의 시장 특성과 어느 정도 맞아떨어집니다.`)
  }

  // 3. 개선이 필요한 부분 (상품 특성 + 선택한 전략과의 궁합)
  const improvements = []
  if (product.demand === '낮음') {
    improvements.push('시장수요가 낮은 편이라 판매 확대에는 다소 시간이 걸릴 수 있습니다.')
  }
  if (product.competition === '높음') {
    improvements.push('경쟁이 치열한 카테고리라 지속적인 차별화 노력이 필요합니다.')
  }
  if (selections.localization === 'A' && product.localizationDifficulty === '높음') {
    improvements.push('현지화 난이도가 높은 시장에서 최소 현지화 전략은 바이어 신뢰 확보에 불리하게 작용할 수 있습니다.')
  }
  if (selections.ad === 'A' && product.adDifficulty === '높음') {
    improvements.push('광고 난이도가 높은 상품에 광고를 최소화해 노출 확보에 어려움이 예상됩니다.')
  }
  if (selections.price === 'C' && product.competition === '높음') {
    improvements.push('경쟁이 치열한 시장에서 프리미엄 가격 전략은 더 설득력 있는 차별화 근거가 필요합니다.')
  }
  if (improvements.length === 0) {
    improvements.push('현재 전략 조합에서 특별히 시급한 개선 사항은 발견되지 않았습니다.')
  }

  // 4. 구매를 고려할 이유 (선택한 전략 + 가격 조건)
  const reasonsToBuy = [
    `선택한 가격 전략(${strategyTitles.price})과 거래 전략(${strategyTitles.deal})이 ${market.nameKo} 시장 진입 조건을 명확히 했습니다.`,
    `판매가격 ₩${product.price.toLocaleString()} 수준이 ${market.nameKo} 시장에서 합리적인 선택지로 보입니다.`,
  ]
  if (totalScore >= 60) {
    reasonsToBuy.push(`${profile.emphasisLabel} 중심의 시장 특성에 맞춰 전략을 구성한 점이 신뢰를 줍니다.`)
  }

  // 5. 수출 시 주의할 점 (국가별 힌트 + 현지화 난이도 + 상품 셀링포인트)
  const exportCautions = [profile.hint]
  if (product.localizationDifficulty === '높음') {
    exportCautions.push('현지화 난이도가 높은 상품이므로 현지 규정과 소비자 취향에 맞춘 추가 대응이 필요합니다.')
  }
  exportCautions.push(product.sellingPoint)

  // 6. 한줄 바이어 코멘트
  const oneLineComment =
    verdict === 'strong'
      ? `"${product.name}, 이 조건이면 바로 계약을 진행하고 싶습니다." — ${market.nameKo} 바이어`
      : verdict === 'moderate'
        ? `"${product.name}, 우선 소량으로 테스트해보고 싶습니다." — ${market.nameKo} 바이어`
        : `"${product.name}, 조건을 조금 더 조정해야 할 것 같습니다." — ${market.nameKo} 바이어`

  return { overallFeedback, strengths, improvements, reasonsToBuy, exportCautions, oneLineComment }
}

// ---- 7-2단계: AI 분석 데이터 구조 + 프롬프트 템플릿 (실제 API 연동 없음) ----
// 아래 두 함수는 이후 실제 AI(예: Claude API) 연결을 쉽게 하기 위한 순수
// 데이터/문자열 변환 함수다. 네트워크 호출, API 키, 결제 기능은 전혀
// 포함하지 않으며, 이미 게임 안에 있는 데이터(market/product/selections/
// scores/budget/totalScore)만 읽어서 값을 만든다. 기존 AI BUYER FEEDBACK
// UI(generateBuyerFeedback/FinalResultScreen의 .ai-feedback-panel 섹션)는
// 전혀 수정하지 않으며, 이 구조는 그와 별개로 나란히 존재한다.

// 게임에 이미 존재하는 상태를 AI 분석에 바로 전달할 수 있는 평평한 데이터
// 구조(buyerAnalysisData)로 변환한다. 점수 계산(computeTotalScore/
// calculateFinalScore/applyStrategyEffect)은 건드리지 않고, 그 결과값만
// 그대로 읽어온다.
function buildBuyerAnalysisData(market, product, selections, scores, budget, totalScore) {
  const selectedStrategies = STRATEGY_ROUNDS.reduce((acc, round) => {
    acc[round.key] = getSelectedStrategyTitle(round, selections)
    return acc
  }, {})

  const buyerAnalysisData = {
    selectedCountry: market.name,
    selectedProduct: product.name,
    productCategory: product.category,
    price: product.price,
    MOQ: product.moq,
    marketDemand: product.demand,
    competition: product.competition,
    localizationDifficulty: product.localizationDifficulty,
    advertisingDifficulty: product.adDifficulty,
    selectedStrategies,
    profitabilityScore: scores.profit,
    advertisingScore: scores.adEfficiency,
    marketFitScore: scores.marketFit,
    operationScore: scores.operations,
    buyerTrust: scores.trust,
    remainingBudget: budget,
    finalScore: totalScore,
  }

  return buyerAnalysisData
}

// buildBuyerAnalysisData()가 만든 gameData를 받아, 실제 AI(바이어 역할)에게
// 그대로 전달할 수 있는 프롬프트 문자열을 만들어 반환한다. 네트워크 호출은
// 하지 않는다 — 이후 실제 AI 연동 시 이 함수의 반환값을 그대로 요청 바디에
// 넣기만 하면 되도록 문자열 생성만 담당한다.
function buildBuyerPrompt(gameData) {
  const strategyLines = STRATEGY_ROUNDS.map((round) => {
    const title = gameData.selectedStrategies[round.key] ?? '-'
    return `- ${round.resultLabel}: ${title}`
  }).join('\n')

  return `당신은 ${gameData.selectedCountry}의 해외 바이어입니다.
플레이어가 선택한 수출 전략과 상품 정보를 바탕으로 실제 바이어 관점의 피드백을 제공합니다.

[상품 정보]
- 상품명: ${gameData.selectedProduct}
- 카테고리: ${gameData.productCategory}
- 판매가격: ${gameData.price}
- MOQ: ${gameData.MOQ}
- 시장수요: ${gameData.marketDemand}
- 경쟁도: ${gameData.competition}
- 현지화 난이도: ${gameData.localizationDifficulty}
- 광고 난이도: ${gameData.advertisingDifficulty}

[플레이어가 선택한 전략]
${strategyLines}

[현재 게임 지표]
- 수익성 점수(profitabilityScore): ${gameData.profitabilityScore}
- 광고 효율 점수(advertisingScore): ${gameData.advertisingScore}
- 시장 적합성 점수(marketFitScore): ${gameData.marketFitScore}
- 운영 관리 점수(operationScore): ${gameData.operationScore}
- 바이어 신뢰도(buyerTrust): ${gameData.buyerTrust}
- 남은 예산(remainingBudget): ${gameData.remainingBudget}
- 최종 점수(finalScore): ${gameData.finalScore}

다음 6개 항목으로 답변해 주세요:
1. Overall Assessment
2. Strengths
3. Concerns
4. Purchase Interest
5. Recommended Improvement
6. Buyer Comment`
}

function App() {
  const [screen, setScreen] = useState('start')
  const [scores, setScores] = useState(INITIAL_SCORES)
  const [selectedMarket, setSelectedMarket] = useState(null)
  const [selectedProductId, setSelectedProductId] = useState(null)
  const [roundIndex, setRoundIndex] = useState(0)
  const [selections, setSelections] = useState({})
  const [budget, setBudget] = useState(initialGameState.budget)
  const [initialBudget, setInitialBudget] = useState(0)
  // 8-2단계: BUYER'S NEXT MOVE에서 고른 행동과, 그로부터 계산된 계약 결과.
  // 기존 게임 state(scores/budget/selections 등)와는 별개의 새 state이며,
  // PLAY AGAIN 시 함께 초기화된다.
  const [buyerDecision, setBuyerDecision] = useState(null)
  const [contractResult, setContractResult] = useState(null)

  const market = MARKET_OPTIONS.find((m) => m.id === selectedMarket) ?? MARKET_OPTIONS[0]
  const product =
    getProductsByMarket(market.id).find((p) => p.id === selectedProductId) ??
    getProductsByMarket(market.id)[0]

  const handleGameStart = () => {
    console.log('GAME START')
    setScreen('select-market')
  }

  const handleMarketSelect = (marketId) => {
    setSelectedMarket(marketId)
  }

  const handleMarketNext = () => {
    console.log('SELECTED MARKET', selectedMarket)
    setScreen('select-product')
  }

  const handleProductNext = (selectedProduct) => {
    console.log('GAME STATE', {
      selectedMarket,
      selectedProductId: selectedProduct.id,
    })
    setSelectedProductId(selectedProduct.id)
    setScreen('mission')
  }

  const handleMissionStart = () => {
    console.log('MISSION START')
    const startingBudget = getMissionBriefing(product).budget
    setBudget(startingBudget)
    setInitialBudget(startingBudget)
    setRoundIndex(0)
    setScreen('decision')
  }

  const handleDecisionNext = (option) => {
    const round = STRATEGY_ROUNDS[roundIndex]
    const { scores: nextScores, budget: nextBudget } = applyStrategyEffect(
      scores,
      budget,
      option.effects,
      option.budgetPct,
    )
    const nextSelections = { ...selections, [round.key]: option.id }
    setScores(nextScores)
    setSelections(nextSelections)
    setBudget(nextBudget)
    console.log('GAME STATE', {
      selectedMarket,
      selectedProductId,
      round: round.key,
      selections: nextSelections,
      scores: nextScores,
      budget: nextBudget,
      turn: roundIndex + 1,
    })

    if (roundIndex + 1 >= STRATEGY_ROUNDS.length) {
      setScreen('buyer-response')
    } else {
      setRoundIndex(roundIndex + 1)
      setScreen('decision')
    }
  }

  const handleContinueFromBuyerResponse = () => {
    setScreen('buyer-next-move')
  }

  const handleBuyerNextMoveSelect = (actionId) => {
    const interestScore = calculateBuyerInterest(scores, market, product, selections)
    const result = calculateContractOutcome(interestScore, scores, market, product, selections, actionId)
    setBuyerDecision(actionId)
    setContractResult(result)
    setScreen('contract-outcome')
  }

  const handleContinueFromContractOutcome = () => {
    setScreen('final-result')
  }

  const handlePlayAgain = () => {
    setScores(INITIAL_SCORES)
    setSelectedMarket(null)
    setSelectedProductId(null)
    setRoundIndex(0)
    setSelections({})
    setBudget(0)
    setInitialBudget(0)
    setBuyerDecision(null)
    setContractResult(null)
    setScreen('start')
  }

  if (screen === 'select-market') {
    return (
      <SelectMarketScreen
        selectedMarket={selectedMarket}
        onSelect={handleMarketSelect}
        onNext={handleMarketNext}
      />
    )
  }

  if (screen === 'select-product') {
    return <SelectProductScreen market={market} onNext={handleProductNext} />
  }

  if (screen === 'mission') {
    return (
      <MissionScreen
        market={market}
        product={product}
        briefing={getMissionBriefing(product)}
        scores={scores}
        onMissionStart={handleMissionStart}
      />
    )
  }

  if (screen === 'decision') {
    return (
      <MissionDecisionScreen
        roundIndex={roundIndex}
        totalRounds={STRATEGY_ROUNDS.length}
        round={STRATEGY_ROUNDS[roundIndex]}
        market={market}
        product={product}
        budget={budget}
        scores={scores}
        onNext={handleDecisionNext}
      />
    )
  }

  if (screen === 'buyer-response') {
    return (
      <BuyerResponseScreen
        market={market}
        product={product}
        scores={scores}
        selections={selections}
        onContinue={handleContinueFromBuyerResponse}
      />
    )
  }

  if (screen === 'buyer-next-move') {
    return (
      <BuyerNextMoveScreen
        market={market}
        product={product}
        scores={scores}
        selections={selections}
        onSelect={handleBuyerNextMoveSelect}
      />
    )
  }

  if (screen === 'contract-outcome') {
    return (
      <ContractOutcomeScreen
        market={market}
        product={product}
        contractResult={contractResult}
        buyerDecision={buyerDecision}
        onContinue={handleContinueFromContractOutcome}
      />
    )
  }

  if (screen === 'final-result') {
    return (
      <FinalResultScreen
        scores={scores}
        market={market}
        product={product}
        selections={selections}
        budget={budget}
        initialBudget={initialBudget}
        onPlayAgain={handlePlayAgain}
        contractResult={contractResult}
      />
    )
  }

  return <StartScreen onStart={handleGameStart} />
}

export default App
