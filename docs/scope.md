# 코퍼스 스코프 정의 (확정)

확정일: 2026-07-29

이 코퍼스는 **"개별 주소지정 가능한 중성원자 배열(트위저/트위저-격자 하이브리드) 기반
양자정보·양자시뮬레이션 연구"**의 지형도다.

이 문서가 코퍼스 편입의 유일한 근거다. 이후 모든 규칙 변경(query.json 의 corpus/exclude,
경계 규칙, branch 용어)은 이 문서를 근거로만 정당화한다. 규칙과 이 문서가 충돌하면 규칙을
고친다 — 반대가 아니다.

## IN
- 광트위저 배열, 또는 개별 주소지정되는 격자 원자
- 위 플랫폼에서의 Rydberg 상호작용, 게이트, 오류정정, 시뮬레이션, 스케일링, readout
- lattice + Rydberg 하이브리드
- Rydberg-dressed (배열 맥락)
- 위 플랫폼을 직접 대상으로 하는 고전 시뮬레이션/벤치마킹, 컴파일러·소프트웨어

## OUT
- ensemble/superatom blockade (개별 주소지정 없음)
- cavity-QED + Rydberg 앙상블 (트위저 배열 원자를 캐비티에 넣은 경우만 IN)
- 개별 주소지정 없는 optical lattice / 양자기체 현미경 / Hubbard
- bulk Rydberg gas, ultralong-range Rydberg molecule, vapor cell 센싱,
  wave packet 분광, 이온 트랩 전반

## 경계 사례 판정 (근거 기록)
| 대상 | 판정 | 근거 |
|---|---|---|
| ensemble / superatom blockade | OUT | 개별 주소지정 없음 = 다른 플랫폼. 선구 계보로 별도 노드는 가능 |
| cavity + Rydberg | OUT | 트위저 배열 원자를 캐비티에 넣은 경우만 IN |
| optical lattice (트위저 아님) | OUT | 단, lattice + Rydberg 하이브리드는 IN |
| Rydberg-dressed | IN | 배열 맥락일 때 |

## 주의 (규칙 설계 시)
- `lattice` / `optical lattice` 를 코퍼스 편입어(weak_context 등)로 넣지 마라 —
  양자기체 현미경·Hubbard 문헌 전체(수천 편)가 유입되어 코퍼스 성격이 바뀐다.
  lattice+Rydberg 하이브리드는 Rydberg 맥락으로 별도 판정한다.
