# Final v11 Quick Start

1. GitHub/AI Studio import
2. 가능하면 `npm test` → **66/66 PASS**
3. 물성/공정값 수정하지 않기
4. `Run single-die thermal` → energy balance 확인
5. `Run complete design + deployment study`
6. 아래 결과창 캡처
   - REPORT-READY FINAL RECOMMENDATION
   - FINAL SCREENING CANDIDATE (convergence 포함)
   - Pattern screening / Geometry refinement / Robustness / High-stack check
   - **INTERCONNECT THERMAL ARCHITECTURE COMPARISON**
7. 자동 로드된 24-Hi 추천 mask에서 `Run selected placement`
8. 같은 mask에서 `Run 1→N cumulative bow`
9. Thermal architecture의 보고용 24-Hi 값을 더 확인하려면 `Run final 24-Hi architecture verification (grid 21)`

## 고정조건
- AlN depth 1.0 µm / width 2.0 µm
- AlN E 300 GPa, k 200 W/mK
- +400 MPa tensile nominal, +300/+400/+500 MPa sensitivity
- universal TSV collar OD 6.0 µm

## Thermal 3-way 비교
- µ-bump + underfill: R″ = 4.2 mm²·K/W
- HCB: R″ = 1.2 mm²·K/W
- HCB + AlN: 동일 HCB R″ + 최종 reinforced-layer mask

같은 power / ambient / external cooling boundary에서 비교합니다.
