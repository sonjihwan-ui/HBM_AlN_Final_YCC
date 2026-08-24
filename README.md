# HBM AlN Reinforcement — Final Integrated Simulator v11

## 목적
이 최종판은 하나의 workflow에서 다음을 연결합니다.

1. AlN이 없는 baseline hybrid-bonding core die
2. 공정 고정 단면(AlN depth 1 µm / rib width 2 µm)에서 reinforcement layout 탐색
3. nominal +400 MPa tensile 및 +300/+400/+500 MPa residual-stress sensitivity
4. pre-stack free-die warpage 기준 최종 reinforced die 선정
5. 16/20/24-Hi selective layer deployment 및 modified-die fraction trade-off
6. **Conventional µ-bump + underfill vs HCB vs HCB + AlN** thermal architecture comparison

이 프로그램은 full 3D FEM이나 실제 제조 yield 예측기가 아니라 **문헌/가정 기반 reduced-order design-screening simulator**입니다.

## Locked AlN model
- Embedded depth: **1.0 µm**
- In-plane rib width: **2.0 µm**
- Backside-adjacent
- AlN E: **300 GPa**
- AlN k: **200 W/m·K** (high-k design target / optimistic assumption)
- Si k: **149 W/m·K**
- Nominal residual stress: **+400 MPa tensile**
- Stress sensitivity: **+300 / +400 / +500 MPa** (comparison only)
- Universal 360° TSV collar OD: **6.0 µm nominal**

## Thermal architecture benchmark
- µ-bump + underfill equivalent inter-die R″: **4.2 mm²·K/W**
- Hybrid-bonding equivalent inter-die R″: **1.2 mm²·K/W**
- Real-HBM external sanity reference: SK hynix reported **22.8% lower thermal resistance** for HBI vs micro-bump + molded underfill at the same bump density.

The 4.2/1.2 values are literature benchmark interface/standoff values, not proprietary HBM4 inputs. The 22.8% value is a sanity reference and is **not fitted** into the solver.

## 실행
```bash
npm test
npm run dev
```
Expected: **66/66 PASS**.

## 최종 결과 생성
1. 기본값 유지
2. `Run single-die thermal`
3. `Run complete design + deployment study`
4. Report-ready recommendation / final candidate / parameter-sweep summary 저장
5. **Interconnect Thermal Architecture Comparison** 저장
6. 24-Hi 추천 mask에서 `Run selected placement`
7. 같은 mask에서 `Run 1→N cumulative bow`
8. 필요하면 `Run final 24-Hi architecture verification (grid 21)`

## 해석 경계
- AlN의 주효과: **pre-stack warpage control / HCB process-window enabler**
- HCB의 주 thermal 효과: **vertical interconnect thermal resistance 감소**
- HCB → HCB+AlN의 추가 Tmax 감소는 작을 수 있으며, 이것은 실패가 아니라 역할 분리 결과입니다.
