import tl from "../../data/timeline.json";
import edgesJson from "../../data/citation-edges.json";

export interface TPaper {
  id: string;
  year: number;
  lane: string;
  fields: string[];
  cited: number;
  title: string;
  author: string;
  group: string | null;
  review?: boolean;
  score: number;
  hot?: boolean;
}
export const papers = (tl as { papers: TPaper[] }).papers;
export const citeEdges = edgesJson as { from: string; to: string }[];
