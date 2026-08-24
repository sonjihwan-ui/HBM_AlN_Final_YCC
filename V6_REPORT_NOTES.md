# V6 보고서용 계산 및 선정 논리

## 연구 질문

V5.3에서 modified AlN core-die 설계를 선정한 뒤, 모든 core layer를 신규 die로 바꾸지 않고 일부 layer만 selective replacement할 때 stack-level bow와 operating thermal benefit을 얼마나 유지할 수 있는가?

## Layer 정의

Layer 1은 logic/base die에 가장 가까운 bottom core die이고 Layer N은 top core die이다.

## Mechanical selective stack

각 core die는 baseline 또는 modified의 두 상태를 갖는다.

Baseline core die:
- 기존 front/body/back effective stack
- AlN equivalent membrane 없음

Modified core die:
- baseline stack + selected AlN geometry의 equivalent directional membrane / eigenmoment

N-layer mask:

`m = [m1, m2, ..., mN]`, `mi in {0,1}`

각 layer의 z 위치를 전체 partial/final stack neutral reference에 맞춰 다시 적분하여 direction별 laminate A/B/D를 계산한다.

`[A B; B D][eps0; kappa] = [N*; M*]`

Final bow는 kappa_x / kappa_y의 paraboloid-equivalent peak-to-valley 값으로 환산한다.

## 1 -> N cumulative history

Stage n에서는 Layers 1...n만 존재한다고 보고 stack equilibrium을 다시 계산한다.

`W_n = equilibrium_bow(Layers 1...n)`

그리고:

`Delta W_n = W_n - W_(n-1)`

을 출력한다.

이는 actual sequential bonding process의 cure/relaxation time history가 아니라 **각 stacking stage의 equivalent equilibrium sequence**이다.

## Final three-way benchmark

- B = all baseline
- S = selective
- A = all modified

Bow capture:

`C_W = (W_B - W_S)/(W_B - W_A) × 100`

Thermal capture:

`C_T = (T_B - T_S)/(T_B - T_A) × 100`

해석:
- 0%: selective가 baseline 수준
- 100%: selective가 all-modified 수준
- >100%: selective가 all-modified보다 더 좋음
- negative: baseline보다 나쁨

특히 all-modified improvement 자체가 매우 작으면 capture ratio가 크게 증폭될 수 있으므로, 보고서에서는 반드시 **absolute improvement vs baseline**을 capture와 같이 제시한다.

## Thermal selective stack

각 layer는 baseline thermal map 또는 AlN-modified thermal map을 사용한다.

X/Y sheet conductance는 layer mask에 따라 달라지고, z-direction은 adjacent layer의 through-thickness resistance + bond resistance로 연결한다.

Layer 1에 logic/base-die heat-source proxy가 연결되고, top surface에 external thermal resistance가 적용된다.

Final output:
- Tmax
- hottest core layer
- layer max/mean temperature profile
- energy balance error

## One-layer importance

각 layer i에 대해:

`mask_i = only Layer i modified`

를 계산한다.

Mechanical marginal benefit:

`Delta W_i = W_baseline - W_i`

Thermal marginal benefit:

`Delta T_i = Tmax_baseline - Tmax_i`

각각 0~100 min-max normalization 후 기본 70/30 weight로 combined importance를 만든다.

이 score는 layer priority를 정하기 위한 screening index이며 물리량이 아니다.

## Minimum replacement heuristic

One-layer combined score가 높은 layer부터 순차적으로 추가한다.

`P1 -> P1+P2 -> ... -> all layers`

Mechanical prefix bow는 exact reduced-order laminate solve.

Thermal prefix는 실행시간을 위해 one-layer Delta Tmax additive estimate를 기본으로 사용한다.

따라서 추천 mask는 반드시 final `Run selected placement` exact thermal solver로 확인한다.

## 수율 관련 표현

V6에는 defect density, known-good-die probability, bond yield per interface 등의 실제 yield model이 없기 때문에 yield %를 직접 계산하지 않는다.

권장 표현:

> "전 층 신규 구조 적용 대신 selective modified-core-die deployment를 통해 신규 공정 적용 die 수를 줄이면서 stack-level benefit을 유지할 가능성을 screening하였다."

> "Yield-oriented selective deployment strategy"

피해야 할 표현:

> "Yield가 XX% 증가한다."
