# Final 10.0 LOCKED 모델 가이드

## 1. 연구 비교
Baseline hybrid-bonding core die와 AlN-reinforced core die를 동일 boundary condition에서 비교한 뒤, 최적 reinforced die의 stack 내 selective placement를 계산한다.

## 2. 최종 고정 AlN 단면
- z-depth = **2.0 µm**
- x-y rib width = **4.0 µm**
- backside-adjacent
- nominal residual stress = **+400 MPa tensile**
- sensitivity = **+300/+400/+500 MPa**

## 3. AlN/Si 물성
- AlN E = **300 GPa**
- AlN ν = **0.245**
- AlN CTE = **4.2 ppm/K**
- AlN k = **200 W/mK**
- Si E = **168 GPa**
- Si k = **149 W/mK**

## 4. TSV collar
모든 occupied TSV는 backside 기준 2.0 µm 구간의 SiO2 liner를 공통 recess한 뒤 360° AlN collar를 가진다. 아래 구간 SiO2 liner는 유지된다.

## 5. optimizer가 실제로 찾는 것
- reinforcement pattern
- TSV-zone/bank coverage layout
- TSV Y-position sensitivity
- uncertainty robustness
- 16/20/24-Hi selective layer mask

AlN depth/width와 nominal +400 MPa는 최적화 knob가 아니다.
