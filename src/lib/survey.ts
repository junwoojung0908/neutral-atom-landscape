import countsJson from "../../data/counts.json";

/** count.ts 산출물. 조사 층(측정)의 데이터. */
export interface Counts {
  version: string;
  generated_at?: string;
  corpus_total: number;
  classified: number;
  unclassified_total: number;
  unclassified_ratio: number;
  branch_hits: Record<string, number>;
  years: number[];
  /** year -> branchId -> 분수 합(1/k 배분). 정규화는 렌더에서 연도별로 한다. */
  shares: Record<string, Record<string, number>>;
  /** year -> 미분류 논문 수 */
  unclassified_by_year: Record<string, number>;
}

export const counts = countsJson as Counts;
