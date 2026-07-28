// SPEC §3 — 앵커 배치와 노드 목표점.
import type { Field } from "../data/schema.ts";

export interface Anchor {
  id: string;
  field: Field;
  angle: number;
  x: number;
  y: number;
}

/**
 * 1차 가지를 원주에 등간격 배치. 각도 순서는 adjacent 인접 위반 수를 최소화하도록
 * 완전탐색(첫 원소 고정 → 나머지 순열, 회전 대칭 제거)으로 정한다.
 */
export function orderAnchors(firstLevel: Field[], radius: number): Anchor[] {
  const ids = firstLevel.map((f) => f.id);
  const idSet = new Set(ids);

  // 인접 희망 쌍 (1차 가지 대상만)
  const want: [string, string][] = [];
  for (const f of firstLevel) {
    for (const a of f.adjacent) if (idSet.has(a)) want.push([f.id, a]);
  }

  const violations = (order: string[]): number => {
    const pos = new Map<string, number>();
    order.forEach((id, i) => pos.set(id, i));
    const n = order.length;
    let v = 0;
    for (const [a, b] of want) {
      const pa = pos.get(a)!;
      const pb = pos.get(b)!;
      const d = Math.min((pa - pb + n) % n, (pb - pa + n) % n);
      if (d !== 1) v++;
    }
    return v;
  };

  let best: string[] = [...ids];
  let bestViol = Infinity;

  if (ids.length <= 1) {
    best = [...ids];
  } else {
    const first = ids[0];
    const perm = ids.slice(1);
    // Heap's algorithm on perm; 첫 원소 고정으로 회전 대칭 제거 → (n-1)! 탐색
    const permute = (k: number) => {
      if (k === 1) {
        const order = [first, ...perm];
        const v = violations(order);
        if (v < bestViol) {
          bestViol = v;
          best = [...order];
        }
        return;
      }
      for (let i = 0; i < k; i++) {
        permute(k - 1);
        const j = k % 2 === 0 ? i : 0;
        [perm[j], perm[k - 1]] = [perm[k - 1], perm[j]];
      }
    };
    permute(perm.length);
  }

  const n = best.length;
  const byId = new Map(firstLevel.map((f) => [f.id, f]));
  return best.map((id, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2; // 12시 방향에서 시작
    return {
      id,
      field: byId.get(id)!,
      angle,
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    };
  });
}

export interface Target {
  x: number;
  y: number;
  k: number; // 소속 1차 가지 수
}

function midAngle(a: number, b: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff / 2;
}

/**
 * SPEC §3 + §3.1(A): 목표점 = 소속 1차 가지 앵커의 평균, 단 축퇴 해소를 위해
 *  - k==1 : 그 앵커
 *  - k==2 : 두 앵커 사이 호(둘레) 위 — 중앙과 구분
 *  - k>=3 : 중앙 허브 링 안 — 여러 가지에 걸친 노드만 중앙에
 */
export function targetFor(
  firstLevels: string[],
  anchorByField: Map<string, Anchor>,
  hubRadius: number,
): Target {
  const anchors = firstLevels.map((id) => anchorByField.get(id)).filter((a): a is Anchor => !!a);
  const k = anchors.length;
  if (k === 0) return { x: 0, y: 0, k: 0 };
  if (k === 1) return { x: anchors[0].x, y: anchors[0].y, k };

  const R = Math.hypot(anchors[0].x, anchors[0].y); // 앵커 반경
  if (k === 2) {
    const mid = midAngle(anchors[0].angle, anchors[1].angle);
    return { x: R * Math.cos(mid), y: R * Math.sin(mid), k };
  }
  // k>=3: 앵커 각의 원형 평균 방향, 반경은 허브 링
  const mx = anchors.reduce((s, a) => s + Math.cos(a.angle), 0) / k;
  const my = anchors.reduce((s, a) => s + Math.sin(a.angle), 0) / k;
  const ang = Math.atan2(my, mx);
  return { x: hubRadius * Math.cos(ang), y: hubRadius * Math.sin(ang), k };
}
