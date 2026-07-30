// 모든 UI 상태를 URL 쿼리스트링에 동기화 (발표용 링크 공유 가능).
import { useCallback, useEffect, useState } from "react";

export type KindFilter = "all" | "group" | "work";

export interface UiState {
  off: Set<string>; // 비활성화된 1차 가지 id
  kind: KindFilter;
  weightMin: number; // 1..5
  q: string; // 검색어
  sel: string | null; // 선택된 노드 id
  traj: boolean; // 그룹 궤적 오버레이
  branch: string | null; // 드릴다운 중인 분야 id
}

function read(): UiState {
  const p = new URLSearchParams(window.location.search);
  const off = new Set((p.get("off") ?? "").split(",").filter(Boolean));
  const rawKind = p.get("kind");
  const kind: KindFilter =
    rawKind === "group" || rawKind === "work" ? rawKind : "all";
  const weightMin = Math.min(5, Math.max(1, Number(p.get("w")) || 1));
  const q = p.get("q") ?? "";
  const sel = p.get("sel");
  return { off, kind, weightMin, q, sel: sel || null, traj: p.get("traj") === "1", branch: p.get("br") || null };
}

const OWN_KEYS = ["off", "kind", "w", "q", "sel", "traj", "br"];
function write(s: UiState) {
  // 자기 키만 갱신하고 나머지(타임라인 뷰 등)는 보존
  const p = new URLSearchParams(window.location.search);
  for (const k of OWN_KEYS) p.delete(k);
  if (s.off.size) p.set("off", [...s.off].join(","));
  if (s.kind !== "all") p.set("kind", s.kind);
  if (s.weightMin > 1) p.set("w", String(s.weightMin));
  if (s.q) p.set("q", s.q);
  if (s.sel) p.set("sel", s.sel);
  if (s.traj) p.set("traj", "1");
  if (s.branch) p.set("br", s.branch);
  const qs = p.toString();
  // 해시 라우팅(#/story 등)을 보존한다
  window.history.replaceState(null, "", (qs ? `${window.location.pathname}?${qs}` : window.location.pathname) + window.location.hash);
}

export function useUiState(): [UiState, (patch: Partial<UiState>) => void] {
  const [state, setState] = useState<UiState>(read);
  useEffect(() => {
    write(state);
  }, [state]);
  const update = useCallback(
    (patch: Partial<UiState>) => setState((s) => ({ ...s, ...patch })),
    [],
  );
  return [state, update];
}
