# V6 외부 AI 코드 감사 프롬프트

이 repository를 실제로 열고 설명 문서가 아니라 **코드 실행 결과로 검증**하라.

## 실행

1. `npm install`
2. `npm test`
3. expected total = 51/51 PASS
4. `npm run dev`
5. browser console/runtime error 확인

## V6 필수 검사

### A. Layer convention
- Layer 1이 logic/base에 가장 가까운 bottom core die인지
- Layer N이 top인지
- 16-Hi Bottom 25%가 Layers 1,2,3,4인지
- Top 25%가 13,14,15,16인지

### B. Per-layer mask
- checkbox mask가 mechanical/thermal stack solver 양쪽에 실제 전달되는지
- unchecked = baseline no-AlN core die
- checked = current main AlN-modified core die

### C. Mechanical
- all-false masked result가 legacy no-AlN stack endpoint와 동일한지
- all-true masked result가 legacy all-AlN endpoint와 동일한지
- arbitrary mixed mask가 다른 결과를 만드는지
- final kx/ky, bow, X/Y direction이 출력되는지

### D. Cumulative stacking
- stage 1 -> N을 순서대로 계산하는지
- stage n에는 Layers 1...n만 포함되는지
- selective mask도 n에서 truncate되는지
- baseline/selective/all-modified partial-stack bow를 각각 재계산하는지
- 단순 final bow/N 보간이면 FAIL

### E. Thermal
- 각 layer가 baseline 또는 modified thermal map을 쓰는지
- adjacent layer vertical conductance가 실제 연결되는지
- base heat injection은 bottom side인지
- layerMax / layerMean profile이 반환되는지
- energy error가 1% 이내인지

### F. Benefit capture
- `(baseline-selective)/(baseline-allModified)` 공식인지
- >100%를 강제로 100으로 clamp하지 않는지
- negative를 숨기지 않는지
- all-modified가 positive benefit이 없으면 N/A 처리하는지

### G. One-layer sensitivity
- N개의 single-modified-layer case가 실제 계산되는지
- Delta bow / Delta Tmax가 계산되는지
- Layer 1...N이 모두 한번씩 평가되는지

### H. Preset
- All baseline / All modified / Bottom / Top / Center / Alternating / Every 3rd / Custom이 존재하는지
- preset thermal이 sensitivity-additive estimate라고 UI/문서에 명시하는지
- exact로 오인하게 표기하면 FAIL

### I. Minimum replacement
- one-layer priority를 기반으로 prefix mask를 만드는지
- mechanical prefix는 exact reduced-order solve인지
- thermal prefix는 additive estimate라고 명시하는지
- global combinatorial optimum이라고 주장하지 않는지

### J. Yield wording
- 실제 yield %를 출력하지 않는지
- yield-oriented selective deployment라고 한정하는지

### K. 16/20/24
- custom mask가 16,20,24 모두 작동하는지

### L. V5.3 regression
- V5.3 DOE/ranking 기능이 삭제되거나 깨지지 않았는지

## 최종 출력

1. PASS/FAIL table A~L
2. 실행한 perturbation 사례
3. dead UI variables
4. physics inconsistency
5. numerical instability
6. exact result vs screening estimate 구분 문제
7. final conclusion: `READY FOR V6 SCREENING: YES/NO`
