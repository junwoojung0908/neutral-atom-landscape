import { counts } from "../lib/survey.ts";
import { papers } from "../lib/timeline.ts";

/** 방법론·한계 — 모든 숫자의 출처를 독자가 감사할 수 있게. */
export default function AboutPage() {
  const hot = papers.filter((p) => p.hot).length;
  return (
    <div className="about">
      <h2>이 지도에 대하여</h2>
      <p>
        이 지도는 특정 논문 목록을 손으로 고른 것이 아니라, <strong>공개된 질의가 정의하는 코퍼스</strong>를
        측정한 결과입니다. 판단이 개입한 지점은 아래에 전부 명시합니다.
      </p>

      <h3>코퍼스</h3>
      <ul>
        <li>출처: arXiv API (quant-ph · physics.atom-ph, 2015–2026), 질의 버전 <code>{counts.version}</code></li>
        <li><strong>플랫폼 게이트</strong>: 트위저/배열 구문은 그대로 편입, bare “Rydberg”는 배열·큐비트·게이트·시뮬레이션
          맥락어가 함께 있어야 편입(증기셀 센싱·분자 분광·벌크 기체 차단). 게이트 손실은 분류 논문의 14%로 측정·감사됨</li>
        <li>범위: 개별 주소지정 가능한 중성원자 배열(트위저) 기반 양자정보·시뮬레이션 —
          자세한 IN/OUT 기준은 저장소의 <a href="https://github.com/junwoojung0908/neutral-atom-landscape/blob/main/docs/scope.md" target="_blank" rel="noreferrer">docs/scope.md</a></li>
        <li>규모: {counts.corpus_total.toLocaleString()}편, 그중 분류 {counts.classified.toLocaleString()}편 ·
          <strong> 미분류 {(counts.unclassified_ratio * 100).toFixed(1)}%</strong> (어느 가지 용어에도 안 걸린 논문 — 숨기지 않고 성장 페이지 회색 밴드로 표시)</li>
        <li>인용: OpenAlex (갱신 {counts.generated_at}) · 매월 1일 자동 재수집</li>
      </ul>

      <h3>중요도 (원 크기·밝기·표시 순서)</h3>
      <ul>
        <li>기본 = 절대 인용수 (크기 ∝ √인용, 밝기 ∝ log 인용)</li>
        <li><strong>최신 보정</strong>: 3년 이내 논문이 (주요 저널* 게재 또는 인용 ≥20)이면
          <code> max(인용, 인용/연차 × 4)</code> 로 환산 — 최신 임팩트가 절대 인용에 묻히지 않게.
          보정된 논문({hot}편)은 <strong>↗</strong> 표시</li>
        <li>*주요 저널 판별: DOI 접두(Nature 계열·Science·PNAS·Quantum·PRL·PRX·RMP)</li>
        <li>라벨의 저자명은 <strong>마지막 저자</strong>(AMO 교신저자 관례의 근사) — 실제 교신저자 메타데이터가 아님</li>
        <li>리뷰 논문은 속 빈 원 (OpenAlex type + 제목 휴리스틱 — type 은 부분 수집 상태라 불완전)</li>
      </ul>

      <h3>분류(가지)와 레인</h3>
      <ul>
        <li>11개 가지는 편집상 택소노미(제목·초록 키워드 매칭). 여러 가지에 걸치면 전부 기록, 레인 배치는 가장 희소한 가지</li>
        <li>시뮬레이션은 뷰에서 3개(평형 상/동역학/게이지·위상)로 분해 — <strong>키워드 휴리스틱이라 오분류 가능</strong>, 검증 표본을 저장소에 공개</li>
        <li>줌아웃의 5개 대분류는 표시용 묶음일 뿐 데이터가 아님</li>
      </ul>

      <h3>알려진 한계 (정직 기록)</h3>
      <ul>
        <li>출판 DOI 가 없는 arXiv 전용 ~680편은 인용 과소집계(프리프린트 레코드)</li>
        <li>연구그룹 배지는 last-author 기준 주요 그룹만 (~13% 커버리지) — 없는 그룹 = 판단 아님, 미큐레이션</li>
        <li>정본 랜드마크 점검에서 확인된 누락 1편(Browaeys–Lahaye 2020 리뷰, 카테고리 필터 추정)</li>
        <li><code>software</code> 가지는 구조적 과소집계 — 해당 문헌 다수가 cs.AR/cs.ET 등 CS 카테고리라 quant-ph 코퍼스 밖</li>
        <li><code>readout</code>(~2%)은 규모가 작지만 결함허용의 독립 전제(비파괴 측정·erasure 검출)라 가지로 유지 — 편집상 결정</li>
        <li>인용 그래프는 지지/반박을 구분하지 못함 — 빨간 점선(contests)만 손 큐레이션</li>
      </ul>

      <p className="about-foot">
        데이터·코드·질의 전체:{" "}
        <a href="https://github.com/junwoojung0908/neutral-atom-landscape" target="_blank" rel="noreferrer">github.com/junwoojung0908/neutral-atom-landscape</a>
      </p>
    </div>
  );
}
