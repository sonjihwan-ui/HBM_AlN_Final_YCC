# Report Notes — Final v11

## 1. Primary mechanical claim
Primary metric is post-singulation / pre-stack free-die warpage. Baseline and reinforced die are compared under identical reduced-order assumptions.

Locked proposal geometry: 1 µm embedded AlN depth, 2 µm rib width, backside-adjacent, universal 360° TSV collar. AlN E=300 GPa, nominal residual stress +400 MPa tensile; +300/+400/+500 MPa is sensitivity only.

## 2. Thermal role separation
Do not claim that AlN is the dominant HBM cooling mechanism. The simulator explicitly separates:

- **µ-bump + underfill → HCB**: vertical interconnect architecture benefit
- **HCB → HCB + AlN**: incremental AlN thermal spreading benefit

Literature benchmark equivalent inter-die R″ values:
- µ-bump + underfill: 4.2 mm²·K/W
- HCB: 1.2 mm²·K/W

System-level effective Rθ is calculated as `(Tmax - Tambient) / total power` under the same modeled stack boundary. Do not directly convert 1.2 vs 4.2 into an HBM-wide percentage.

SK hynix real-HBM HBI result (22.8% lower thermal resistance at same bump density) is shown only as an external sanity reference; the model is not calibrated to force 22.8%.

## 3. AlN k=200 interpretation
`k_AlN = 200 W/mK` is a high-k design target / optimistic material assumption. It is not claimed to be the thermal conductivity measured on the same specimen that supplied the +400 MPa residual-stress reference.

If HCB→HCB+AlN Tmax change remains mK-scale even at k=200, the safe conclusion is that the proposed AlN geometry is primarily a mechanical reinforcement, while HCB architecture provides the dominant vertical thermal benefit.

## 4. Stack placement
Modified-die fraction is a process-complexity/cost proxy, not a monetary cost or predicted yield percentage. Very large global stack-bow cancellation values must be described as reduced-order curvature-cancellation tendencies, not validated product warpage reductions.
