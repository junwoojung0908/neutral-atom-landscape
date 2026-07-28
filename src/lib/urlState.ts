// 모든 UI 상태를 URL 쿼리스트링에 동기화 (발표용 링크 공유 가능).
import { useCallback, useEffect, useState } from "react";

export type KindFilter = "all" | "group" | "work";

export interface UiState {
  off: Set<string>; // 비활성화된 1차 가지 id
  kind: KindFilter;
  weightMin: number; // 1..5
  q: string; // 검색어
  sel: string | null; // 선택된 노드 id
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
  return { off, kind, weightMin, q, sel: sel || null };
}

function write(s: UiState) {
  const p = new URLSearchParams();
  if (s.off.size) p.set("off", [...s.off].join(","));
  if (s.kind !== "all") p.set("kind", s.kind);
  if (s.weightMin > 1) p.set("w", String(s.weightMin));
  if (s.q) p.set("q", s.q);
  if (s.sel) p.set("sel", s.sel);
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
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
