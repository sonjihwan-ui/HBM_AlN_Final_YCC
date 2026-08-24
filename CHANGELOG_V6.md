# V6 Changelog

## V5.3 -> V6

- Per-layer baseline/modified boolean mask 추가
- Layer 1 = logic/base-adjacent bottom core die convention 고정
- 12/16/20/24-Hi layer checkbox UI 추가
- All-baseline / Selective / All-modified three-way benchmark 추가
- Final selective stack bow, kappa_x/y, X/Y section direction 추가
- Per-layer selective thermal maps 추가
- Final Tmax / hottest layer / layer temperature profile 추가
- 1 -> N cumulative partial-stack equilibrium bow 추가
- Stage-by-stage Delta bow 추가
- One-layer sensitivity scan 추가
- Bottom/Top/Center/Alternating/Every-3rd preset comparison 추가
- Benefit capture ratio 추가
- Replacement efficiency screening index 추가
- Priority-based minimum-replacement heuristic 추가
- V6 JSON export 추가
- 13개의 V6 regression tests 추가
- Total automated tests: 51/51 PASS

## Performance design

24-Hi layer sensitivity에서 exact thermal solve를 모든 combinatorial prefix에 반복하면 실행시간이 매우 커지므로:

- one-layer sensitivity thermal = exact coarse-grid solve
- preset thermal = additive sensitivity estimate
- priority-plan thermal = additive sensitivity estimate
- exact final candidate/preset = normal stack grid `Run selected placement`

구조로 분리하였다.
