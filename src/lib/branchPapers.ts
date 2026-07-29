import data from "../../data/branch-papers.json";

export interface Landmark {
  id: string; label: string; byline: string; venue: string; year: number;
  weight: number; refs: { type: string; value: string }[];
}
export interface BPaper { id: string; year: number; title: string; author: string; cited?: number }
export interface BranchData {
  count: number;
  byYear: Record<string, number>;
  landmarks: Landmark[];
  papers: BPaper[];
  topCited?: BPaper[];
}

export const branchPapers = data as Record<string, BranchData>;
