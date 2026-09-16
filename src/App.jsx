import { useState } from 'react'
import './App.css'

const SCORE_LABELS = {
  profit: '수익성',
  adEfficiency: '광고효율',
  marketFit: '시장적합성',
  operations: '운영관리',
}

const INITIAL_SCORES = {
  profit: 50,
  adEfficiency: 50,
  marketFit: 50,
  operations: 50,
}

const INITIAL_REVIEWS = 12
const TARGET_REVIEWS = 30

function applyEffects(scores, effects) {
  const next = { ...scores }
  for (const key of Object.keys(effects)) {
    next[key] = (next[key] ?? 0) + effects[key]
  }
  return next
}

const PRICE_OPTIONS = [
  {
    id: 'A',
    title: '가격을 낮춘다',
    subtitle: '초기 구매자를 확보한다',
    effects: { profit: -5, adEfficiency: 0, marketFit: 5, operations: 0 },
    result: [
      '가격을 낮춰 초기 구매자를 확보하는 전략을 선택했습니다.',
      '초기 유입에는 도움이 될 수 있지만 판매당 수익성은 낮아집니다.',
    ],
  },
  {
    id: 'B',
    title: '적정 가격을 유지한다',
    subtitle: '수익성과 판매를 균형있게 가져간다',
    effects: { profit: 8, adEfficiency: 0, marketFit: 5, operations: 2 },
    result: [
      '가격과 수익성의 균형을 고려하는 전략을 선택했습니다.',
      '안정적인 판매 구조를 만들 수 있지만 초기 고객 확보에는 시간이 필요할 수 있습니다.',
    ],
  },
  {
    id: 'C',
    title: '가격은 유지하고 프로모션을 활용한다',
    subtitle: '가격 대신 프로모션으로 구매를 유도한다',
    effects: { profit: 3, adEfficiency: 2, marketFit: 8, operations: 3 },
    result: [
      '가격을 유지하면서 프로모션으로 구매를 유도하는 전략을 선택했습니다.',
      '가격 경쟁력을 직접 낮추지 않으면서 초기 구매를 유도할 수 있습니다.',
    ],
  },
]

const AD_BUDGET_OPTIONS = [
  {
    id: 'A',
    title: 'Qoo10 중심',
    breakdown: [
      { label: 'Qoo10', amount: '₩350,000' },
      { label: 'SNS', amount: '₩100,000' },
      { label: '기타', amount: '₩50,000' },
    ],
    effects: { profit: -2, adEfficiency: 8, marketFit: 3, operations: 2 },
    result: [
      'Qoo10에 집중해 플랫폼 내 노출을 확보하는 전략입니다.',
      '초기 유입을 확보할 수 있지만 특정 채널에 대한 의존도가 높아질 수 있습니다.',
    ],
  },
  {
    id: 'B',
    title: '균형 투자',
    breakdown: [
      { label: 'Qoo10', amount: '₩200,000' },
      { label: 'SNS', amount: '₩200,000' },
      { label: '기타', amount: '₩100,000' },
    ],
    effects: { profit: 3, adEfficiency: 5, marketFit: 7, operations: 7 },
    result: [
      '여러 채널에 예산을 분산해 특정 채널의 성과 변동 위험을 줄이는 전략입니다.',
    ],
  },
  {
    id: 'C',
    title: 'SNS 중심',
    breakdown: [
      { label: 'Qoo10', amount: '₩100,000' },
      { label: 'SNS', amount: '₩350,000' },
      { label: '기타', amount: '₩50,000' },
    ],
    effects: { profit: 1, adEfficiency: 3, marketFit: 8, operations: 2 },
    result: [
      'SNS를 통해 외부 유입을 확대하는 전략입니다.',
      '브랜드 인지도를 높일 수 있지만 실제 구매로 이어지는지 지속적인 확인이 필요합니다.',
    ],
  },
]

function JapanFlagIcon({ className = 'mission-title__flag' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 3 2"
      role="img"
      aria-label="일본 국기"
    >
      <rect width="3" height="2" fill="#ffffff" />
      <circle cx="1.5" cy="1" r="0.6" fill="#bc002d" />
    </svg>
  )
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

function StartScreen({ onStart }) {
  return (
    <div className="start-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="start-card">
        <div className="brand">
          <span className="brand__eyebrow">GTEP</span>
          <h1 className="brand__title">TRADE SIMULATOR</h1>
        </div>

        <p className="tagline">내가 크로스보더 셀러라면?</p>

        <div className="route" role="img" aria-label="한국에서 일본으로">
          <span className="route__flag">🇰🇷</span>
          <span className="route__arrow" aria-hidden="true">
            &#8594;
          </span>
          <span className="route__flag">🇯🇵</span>
        </div>

        <p className="description">
          제한된 예산으로 일본 시장에서
          <br />
          첫 판매를 만들어보세요.
        </p>

        <button type="button" className="start-button" onClick={onStart}>
          GAME START
        </button>
      </main>
    </div>
  )
}

function MissionScreen({ onMissionStart }) {
  return (
    <div className="mission-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="mission-card">
        <span className="mission-badge">MISSION 01</span>

        <h1 className="mission-title">
          <JapanFlagIcon />
          JAPAN MARKET
        </h1>

        <div className="mission-body">
          <p>
            당신은 한국 브랜드의
            <br />
            해외시장 담당자입니다.
          </p>
          <p>
            이번 미션은
            <br />
            일본 Qoo10에서
            <br />
            첫 판매를 만들어내는 것입니다.
          </p>
        </div>

        <dl className="mission-info">
          <div className="mission-info__row">
            <dt>PRODUCT</dt>
            <dd>JENNY HONG</dd>
          </div>
          <div className="mission-info__row">
            <dt>PLATFORM</dt>
            <dd>Qoo10 Japan</dd>
          </div>
          <div className="mission-info__row">
            <dt>BUDGET</dt>
            <dd>&#8361;500,000</dd>
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

function PriceStrategyScreen({ onNext }) {
  const [selectedId, setSelectedId] = useState(null)
  const selectedOption =
    PRICE_OPTIONS.find((option) => option.id === selectedId) ?? null

  const handleSelect = (option) => {
    console.log(option.id)
    setSelectedId(option.id)
  }

  return (
    <div className="price-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="price-card">
        <span className="price-step">01 / 06</span>

        <h1 className="price-title">💰 PRICE STRATEGY</h1>

        <p className="price-lead">일본 시장에 처음 출시합니다.</p>
        <p className="price-question">어떤 가격 전략을 선택하시겠습니까?</p>

        <div className="choice-list">
          {PRICE_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.id}
              option={option}
              selected={selectedId === option.id}
              onSelect={handleSelect}
            />
          ))}
        </div>

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
          </section>
        )}

        {selectedOption && (
          <button
            type="button"
            className="start-button"
            onClick={() => onNext(selectedOption)}
          >
            NEXT &#8594;
          </button>
        )}
      </main>
    </div>
  )
}

function AdBudgetScreen({ onNext }) {
  const [selectedId, setSelectedId] = useState(null)
  const [committed, setCommitted] = useState(false)
  const selectedOption =
    AD_BUDGET_OPTIONS.find((option) => option.id === selectedId) ?? null

  const handleSelect = (option) => {
    if (committed) return
    console.log(option.id)
    setSelectedId(option.id)
  }

  const handleNext = () => {
    if (!selectedOption || committed) return
    onNext(selectedOption)
    setCommitted(true)
  }

  return (
    <div className="ad-budget-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="ad-budget-card">
        <span className="price-step">02 / 06</span>

        <h1 className="price-title">📈 AD BUDGET</h1>

        <p className="price-lead">
          일본 시장에서 제품을 알리기 위해
          <br />
          &#8361;500,000의 마케팅 예산이 주어졌습니다.
        </p>
        <p className="price-question">어떻게 예산을 배분하시겠습니까?</p>

        <div className="choice-list">
          {AD_BUDGET_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.id}
              option={option}
              selected={selectedId === option.id}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {selectedOption && (
          <section className="result-panel">
            <span className="result-panel__badge">전략 선택 완료</span>
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
          </section>
        )}

        {selectedOption && !committed && (
          <button type="button" className="start-button" onClick={handleNext}>
            NEXT &#8594;
          </button>
        )}
      </main>
    </div>
  )
}

const PERFORMANCE_FIELDS = [
  { key: 'adSpend', label: '광고비' },
  { key: 'impressions', label: '노출' },
  { key: 'clicks', label: '클릭' },
  { key: 'ctr', label: 'CTR' },
  { key: 'purchases', label: '구매' },
  { key: 'revenue', label: '매출' },
]

const PERFORMANCE_DATA = {
  A: {
    adSpend: '₩350,000',
    impressions: '28,000',
    clicks: '700',
    ctr: '2.50%',
    purchases: '35',
    revenue: '₩104,965',
    reaction: [
      'Qoo10 내 노출과 클릭은 충분히 확보했습니다.',
      '하지만 특정 판매 채널에 대한 의존도가 높은 상황입니다.',
    ],
  },
  B: {
    adSpend: '₩200,000',
    impressions: '22,000',
    clicks: '550',
    ctr: '2.50%',
    purchases: '32',
    revenue: '₩95,968',
    reaction: [
      '여러 채널에서 안정적인 유입을 확보했습니다.',
      '초기 시장 테스트에서 비교적 균형 잡힌 결과가 나타났습니다.',
    ],
  },
  C: {
    adSpend: '₩350,000',
    impressions: '35,000',
    clicks: '630',
    ctr: '1.80%',
    purchases: '25',
    revenue: '₩74,975',
    reaction: [
      'SNS를 통한 노출과 외부 유입은 증가했습니다.',
      '하지만 관심이 실제 구매로 이어지는지 추가적인 분석이 필요합니다.',
    ],
  },
}

function WeekPerformanceScreen({ adBudgetId, scores, onNext }) {
  const data = PERFORMANCE_DATA[adBudgetId] ?? PERFORMANCE_DATA.B

  return (
    <div className="performance-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="performance-card">
        <span className="price-step">03 / 06</span>

        <h1 className="price-title">📊 WEEK 1 PERFORMANCE</h1>

        <p className="price-lead">첫 번째 주의 마케팅 결과가 나왔습니다.</p>

        <div className="stat-grid">
          {PERFORMANCE_FIELDS.map((field) => (
            <div key={field.key} className="stat-card">
              <span className="stat-card__label">{field.label}</span>
              <span className="stat-card__value">{data[field.key]}</span>
            </div>
          ))}
        </div>

        <div className="reaction-panel">
          {data.reaction.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <div className="performance-score">
          <span className="price-step">CURRENT SCORE</span>
          <dl className="mission-info">
            {Object.entries(SCORE_LABELS).map(([key, label]) => (
              <div key={key} className="mission-info__row">
                <dt>{label}</dt>
                <dd>{scores[key]}</dd>
              </div>
            ))}
          </dl>
        </div>

        <button type="button" className="start-button" onClick={onNext}>
          NEXT &#8594;
        </button>
      </main>
    </div>
  )
}

const REVIEW_OPTIONS = [
  {
    id: 'A',
    title: '리뷰 마케팅에 투자한다',
    subtitle: '체험단과 리뷰 확보에 추가 예산을 사용한다.',
    effects: { profit: -3, adEfficiency: 2, marketFit: 6, operations: 4 },
    reviewDelta: 15,
    result: ['리뷰를 빠르게 확보해 구매자의 신뢰도를 높이는 전략입니다.'],
  },
  {
    id: 'B',
    title: '상품 페이지를 개선한다',
    subtitle: '상품 이미지와 상세 설명을 개선해 구매 전환을 높인다.',
    effects: { profit: 2, adEfficiency: 5, marketFit: 5, operations: 2 },
    reviewDelta: 5,
    result: [
      '상품 정보를 개선해 방문자가 구매를 결정하는 데 필요한 정보를',
      '더 명확하게 제공하는 전략입니다.',
    ],
  },
  {
    id: 'C',
    title: 'SNS 콘텐츠를 추가 제작한다',
    subtitle: '제품의 장점과 사용 상황을 보여주는 콘텐츠를 추가한다.',
    effects: { profit: -2, adEfficiency: 6, marketFit: 5, operations: 1 },
    reviewDelta: 8,
    result: ['SNS 콘텐츠를 통해 제품에 대한 관심과 외부 유입을 확대하는 전략입니다.'],
  },
]

function ReviewCrisisScreen({ reviews, onNext }) {
  const [selectedId, setSelectedId] = useState(null)
  const selectedOption =
    REVIEW_OPTIONS.find((option) => option.id === selectedId) ?? null

  const handleSelect = (option) => {
    console.log(option.id)
    setSelectedId(option.id)
  }

  return (
    <div className="review-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="review-card">
        <span className="price-step">04 / 06</span>

        <h1 className="price-title">&#11088; REVIEW CRISIS</h1>

        <div className="mission-body">
          <p>첫 주 광고를 통해 방문자는 확보했습니다.</p>
          <p>
            하지만 상품 리뷰가 부족해
            <br />
            구매 전환율이 기대보다 낮게 나타나고 있습니다.
          </p>
        </div>

        <dl className="mission-info">
          <div className="mission-info__row">
            <dt>현재 리뷰</dt>
            <dd>{reviews}개</dd>
          </div>
          <div className="mission-info__row">
            <dt>목표 리뷰</dt>
            <dd>{TARGET_REVIEWS}개</dd>
          </div>
        </dl>

        <p className="price-question">
          다음 주 판매를 늘리기 위해
          <br />
          어떤 전략을 선택하시겠습니까?
        </p>

        <div className="choice-list">
          {REVIEW_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.id}
              option={option}
              selected={selectedId === option.id}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {selectedOption && (
          <section className="result-panel">
            <span className="result-panel__badge">STRATEGY SELECTED</span>
            <h2 className="result-panel__title">{selectedOption.title}</h2>
            <div className="result-panel__desc">
              {selectedOption.result.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <ul className="result-panel__scores">
              <li>
                <span>리뷰</span>
                <span className="result-panel__delta result-panel__delta--up">
                  +{selectedOption.reviewDelta}
                </span>
              </li>
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

            <div className="review-progress">
              <span className="result-panel__badge">CURRENT REVIEWS</span>
              <span className="review-progress__value">
                {reviews + selectedOption.reviewDelta} / {TARGET_REVIEWS}
              </span>
            </div>
          </section>
        )}

        {selectedOption && (
          <button
            type="button"
            className="start-button"
            onClick={() => onNext(selectedOption)}
          >
            NEXT &#8594;
          </button>
        )}
      </main>
    </div>
  )
}

const BUYER_TRADE_TERM = 'FOB Incheon'
const BUYER_PAYMENT = 'T/T'

const BUYER_OPTIONS = [
  {
    id: 'A',
    title: 'MOQ를 그대로 유지한다',
    subtitle: '기존 MOQ 1,000개를 유지하고 거래조건도 그대로 진행한다.',
    moq: '1,000 units',
    effects: { profit: 5, adEfficiency: 0, marketFit: 2, operations: 5 },
    result: ['기존 거래조건을 유지해 재고 및 운영 부담을 줄였습니다.'],
  },
  {
    id: 'B',
    title: 'MOQ를 500개로 낮춘다',
    subtitle: '첫 거래의 진입장벽을 낮추기 위해 MOQ를 500개로 조정한다.',
    moq: '500 units',
    effects: { profit: -2, adEfficiency: 2, marketFit: 6, operations: 3 },
    result: ['초기 거래의 진입장벽을 낮춰 바이어의 구매 부담을 줄였습니다.'],
  },
  {
    id: 'C',
    title: 'MOQ는 유지하고 단가를 조정한다',
    subtitle: 'MOQ 1,000개는 유지하되 첫 거래에 한해 가격 조건을 협상한다.',
    moq: '1,000 units',
    effects: { profit: -4, adEfficiency: 1, marketFit: 5, operations: 4 },
    result: ['가격 조건을 활용해 거래 성사 가능성을 높였습니다.'],
  },
]

// Static, pre-written buyer feedback keyed by BUYER_OPTIONS id (A/B/C).
// This is a placeholder for a future real AI (e.g. Claude) call — swap the
// body of getBuyerFeedback() for an API request later; callers stay the same.
const BUYER_FEEDBACK = {
  A: {
    strategy: 'MOQ 1,000개를 유지한다',
    feedback: [
      '기존 MOQ를 유지하는 전략은 재고 및 운영 부담을 줄이는 데 유리합니다.',
      '다만 첫 거래를 진행하는 일본 바이어 입장에서는 초기 주문 부담이 높아질 수 있습니다.',
    ],
    tip: [
      '첫 거래에서는 MOQ뿐 아니라 바이어의 초기 구매 부담과 장기 거래 가능성을 함께 고려하는 것이 중요합니다.',
    ],
  },
  B: {
    strategy: 'MOQ를 500개로 낮춘다',
    feedback: [
      'MOQ를 낮추면 첫 거래의 진입장벽을 낮출 수 있습니다.',
      '바이어가 제품을 테스트할 수 있는 기회를 제공한다는 장점이 있지만, 판매자의 물류 및 수익성 측면에서는 추가적인 검토가 필요합니다.',
    ],
    tip: [
      '첫 거래에서는 MOQ를 무조건 낮추기보다 테스트 주문 이후 MOQ를 다시 협의하는 방법도 고려할 수 있습니다.',
    ],
  },
  C: {
    strategy: 'MOQ는 유지하고 단가를 조정한다',
    feedback: [
      'MOQ를 유지하면서 가격 조건을 조정하는 전략은 판매자의 물류 효율을 유지하면서 바이어의 가격 부담을 낮추는 방법입니다.',
      '다만 가격을 낮추면 수익성이 감소할 수 있으므로 장기적인 가격 정책을 함께 고려해야 합니다.',
    ],
    tip: [
      '첫 거래에서는 단가뿐 아니라 MOQ, 결제조건, 거래조건을 함께 협상하는 것이 중요합니다.',
    ],
  },
}

function getBuyerFeedback(id) {
  return BUYER_FEEDBACK[id] ?? null
}

function BuyerNegotiationScreen({ onNext }) {
  const [selectedId, setSelectedId] = useState(null)
  const selectedOption =
    BUYER_OPTIONS.find((option) => option.id === selectedId) ?? null
  const feedback = selectedOption ? getBuyerFeedback(selectedOption.id) : null

  const handleSelect = (option) => {
    console.log(option.id)
    setSelectedId(option.id)
  }

  return (
    <div className="buyer-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="buyer-card">
        <span className="price-step">05 / 06</span>

        <h1 className="price-title">BUYER NEGOTIATION</h1>

        <span className="mission-badge mission-badge--icon">
          <JapanFlagIcon className="mission-badge__flag" />
          JAPANESE BUYER
        </span>

        <div className="mission-body">
          <p>일본 바이어가 제품에 관심을 보였습니다.</p>
          <p>
            하지만 첫 거래를 위해
            <br />
            MOQ와 거래조건에 대한 협상을 요청했습니다.
          </p>
        </div>

        <div className="strategy-summary">
          <span className="price-step">BUYER REQUEST</span>
          <dl className="mission-info">
            <div className="mission-info__row">
              <dt>제품</dt>
              <dd>Korean Lifestyle Product</dd>
            </div>
            <div className="mission-info__row">
              <dt>MOQ</dt>
              <dd>1,000 units</dd>
            </div>
            <div className="mission-info__row">
              <dt>Trade Term</dt>
              <dd>{BUYER_TRADE_TERM}</dd>
            </div>
            <div className="mission-info__row">
              <dt>Payment</dt>
              <dd>{BUYER_PAYMENT}</dd>
            </div>
          </dl>
        </div>

        <div className="reaction-panel">
          <p>&quot;첫 거래인 만큼 MOQ를 낮춰주실 수 있을까요?&quot;</p>
        </div>

        <div className="choice-list">
          {BUYER_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.id}
              option={option}
              selected={selectedId === option.id}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {selectedOption && (
          <section className="result-panel">
            <span className="result-panel__badge">STRATEGY SELECTED</span>
            <h2 className="result-panel__title">{selectedOption.title}</h2>
            <div className="result-panel__desc">
              {selectedOption.result.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            <span className="result-panel__badge">거래조건</span>
            <dl className="mission-info">
              <div className="mission-info__row">
                <dt>MOQ</dt>
                <dd>{selectedOption.moq}</dd>
              </div>
              <div className="mission-info__row">
                <dt>Trade Term</dt>
                <dd>{BUYER_TRADE_TERM}</dd>
              </div>
              <div className="mission-info__row">
                <dt>Payment</dt>
                <dd>{BUYER_PAYMENT}</dd>
              </div>
            </dl>

            <ul className="result-panel__scores">
              {Object.entries(selectedOption.effects).map(([key, value]) => (
                <li key={key}>
                  <span>{SCORE_LABELS[key]}</span>
                  <span
                    className={
                      value > 0
                        ? 'result-panel__delta result-panel__delta--up'
                        : value < 0
                          ? 'result-panel__delta result-panel__delta--down'
                          : 'result-panel__delta'
                    }
                  >
                    {value >= 0 ? `+${value}` : value}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {selectedOption && feedback && (
          <section className="ai-feedback-panel">
            <span className="ai-feedback-panel__badge">
              &#129302; AI BUYER FEEDBACK
            </span>
            <p className="ai-feedback-panel__subtitle">
              &quot;선택한 거래전략을 일본 바이어의 관점에서 분석합니다.&quot;
            </p>

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
            NEXT &#8594;
          </button>
        )}
      </main>
    </div>
  )
}

function FinalResultScreen({ scores, priceId, adBudgetId, reviewId, buyerId, onPlayAgain }) {
  const totalRaw = Math.round(
    (scores.profit + scores.adEfficiency + scores.marketFit + scores.operations) / 4,
  )
  const totalScore = Math.max(0, Math.min(100, totalRaw))

  let resultLines
  if (totalScore >= 80) {
    resultLines = ['일본 시장 진출 전략을 성공적으로 설계했습니다.']
  } else if (totalScore >= 60) {
    resultLines = ['안정적인 전략을 구성했지만,', '일부 개선할 부분이 있습니다.']
  } else {
    resultLines = ['일본 시장 진출 과정에서', '추가적인 전략 조정이 필요합니다.']
  }

  const priceOption = PRICE_OPTIONS.find((option) => option.id === priceId)
  const adOption = AD_BUDGET_OPTIONS.find((option) => option.id === adBudgetId)
  const reviewOption = REVIEW_OPTIONS.find((option) => option.id === reviewId)
  const buyerOption = BUYER_OPTIONS.find((option) => option.id === buyerId)

  return (
    <div className="final-result-screen">
      <div className="screen__glow" aria-hidden="true" />
      <div className="screen__grid" aria-hidden="true" />

      <main className="final-result-card">
        <span className="price-step">06 / 06</span>

        <h1 className="price-title">FINAL RESULT</h1>

        <span className="mission-badge">JAPAN MARKET PERFORMANCE</span>

        <p className="price-lead">일본 시장 진출 전략이 완료되었습니다.</p>

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

        <div className="reaction-panel">
          {resultLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <div className="strategy-summary">
          <span className="price-step">YOUR STRATEGY</span>
          <div className="strategy-list">
            <div className="strategy-row">
              <span className="strategy-row__label">가격 전략</span>
              <span className="strategy-row__value">
                {priceOption ? priceOption.title : '-'}
              </span>
            </div>
            <div className="strategy-row">
              <span className="strategy-row__label">광고 전략</span>
              <span className="strategy-row__value">
                {adOption ? adOption.title : '-'}
              </span>
            </div>
            <div className="strategy-row">
              <span className="strategy-row__label">리뷰 전략</span>
              <span className="strategy-row__value">
                {reviewOption ? reviewOption.title : '-'}
              </span>
            </div>
            <div className="strategy-row">
              <span className="strategy-row__label">바이어 협상 전략</span>
              <span className="strategy-row__value">
                {buyerOption ? buyerOption.title : '-'}
              </span>
            </div>
          </div>
        </div>

        <button type="button" className="start-button" onClick={onPlayAgain}>
          PLAY AGAIN
        </button>
      </main>
    </div>
  )
}

function App() {
  const [screen, setScreen] = useState('start')
  const [scores, setScores] = useState(INITIAL_SCORES)
  const [reviews, setReviews] = useState(INITIAL_REVIEWS)
  const [selectedPriceId, setSelectedPriceId] = useState(null)
  const [selectedAdBudgetId, setSelectedAdBudgetId] = useState(null)
  const [selectedReviewId, setSelectedReviewId] = useState(null)
  const [selectedBuyerId, setSelectedBuyerId] = useState(null)

  const handleGameStart = () => {
    console.log('GAME START')
    setScreen('mission')
  }

  const handleMissionStart = () => {
    console.log('MISSION START')
    setScreen('price')
  }

  const handlePriceNext = (option) => {
    setScores(applyEffects(scores, option.effects))
    setSelectedPriceId(option.id)
    setScreen('ad-budget')
  }

  const handleAdBudgetNext = (option) => {
    const next = applyEffects(scores, option.effects)
    setScores(next)
    setSelectedAdBudgetId(option.id)
    console.log('GAME STATE', {
      selectedPriceId,
      selectedAdBudgetId: option.id,
      scores: next,
    })
    setScreen('performance')
  }

  const handlePerformanceNext = () => {
    setScreen('review-crisis')
  }

  const handleReviewNext = (option) => {
    const nextScores = applyEffects(scores, option.effects)
    const nextReviews = reviews + option.reviewDelta
    setScores(nextScores)
    setReviews(nextReviews)
    setSelectedReviewId(option.id)
    console.log('GAME STATE', {
      selectedPriceId,
      selectedAdBudgetId,
      selectedReviewId: option.id,
      reviews: nextReviews,
      scores: nextScores,
    })
    setScreen('buyer-negotiation')
  }

  const handleBuyerNext = (option) => {
    const nextScores = applyEffects(scores, option.effects)
    setScores(nextScores)
    setSelectedBuyerId(option.id)
    console.log('GAME STATE', {
      selectedPriceId,
      selectedAdBudgetId,
      selectedReviewId,
      selectedBuyerId: option.id,
      reviews,
      scores: nextScores,
    })
    setScreen('final-result')
  }

  const handlePlayAgain = () => {
    setScores(INITIAL_SCORES)
    setReviews(INITIAL_REVIEWS)
    setSelectedPriceId(null)
    setSelectedAdBudgetId(null)
    setSelectedReviewId(null)
    setSelectedBuyerId(null)
    setScreen('start')
  }

  if (screen === 'mission') {
    return <MissionScreen onMissionStart={handleMissionStart} />
  }

  if (screen === 'price') {
    return <PriceStrategyScreen onNext={handlePriceNext} />
  }

  if (screen === 'ad-budget') {
    return <AdBudgetScreen onNext={handleAdBudgetNext} />
  }

  if (screen === 'performance') {
    return (
      <WeekPerformanceScreen
        adBudgetId={selectedAdBudgetId}
        scores={scores}
        onNext={handlePerformanceNext}
      />
    )
  }

  if (screen === 'review-crisis') {
    return <ReviewCrisisScreen reviews={reviews} onNext={handleReviewNext} />
  }

  if (screen === 'buyer-negotiation') {
    return <BuyerNegotiationScreen onNext={handleBuyerNext} />
  }

  if (screen === 'final-result') {
    return (
      <FinalResultScreen
        scores={scores}
        priceId={selectedPriceId}
        adBudgetId={selectedAdBudgetId}
        reviewId={selectedReviewId}
        buyerId={selectedBuyerId}
        onPlayAgain={handlePlayAgain}
      />
    )
  }

  return <StartScreen onStart={handleGameStart} />
}

export default App
