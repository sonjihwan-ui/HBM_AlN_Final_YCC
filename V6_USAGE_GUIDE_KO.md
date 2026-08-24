# V6 사용 순서

## 첫 실행

1. `npm test` -> 51/51 PASS 확인
2. V5.3을 아직 안 돌렸다면 먼저 V5.3 Full Pipeline
3. 최종 후보가 납득되면 `Apply final candidate to main geometry controls`
4. V6로 이동

## V6 1차 분석

### 1. 16-Hi 선택
처음에는 16-Hi에서 layer trend를 확인한다.

### 2. One-layer sensitivity
`Run one-layer sensitivity scan`

봐야 할 것:
- 상단 / 중앙 / 하단 중 어디가 mechanical에 민감한가
- thermal은 어느 layer가 민감한가
- mechanical과 thermal priority가 같은지 다른지

### 3. Preset comparison
`Compare placement presets`

봐야 할 것:
- Bottom vs Top vs Center
- Alternating
- All-modified

Thermal preset 숫자는 screening estimate다.

### 4. Exact verification
관심 preset을 checkbox로 그대로 만들거나 preset을 적용한 뒤:

`Run selected placement`

여기서만 final exact thermal / bow를 판단한다.

### 5. Cumulative stacking
`Run 1→N cumulative bow`

봐야 할 것:
- 어느 stacking stage에서 bow가 급격히 변하는가
- modified die가 추가된 stage에서 Delta bow가 어떻게 바뀌는가
- baseline/selective/all-modified curve가 언제 벌어지는가

### 6. Minimum replacement
`Build minimum-replacement plan`

50 / 75 / 90% target은 heuristic recommendation이다.
추천 layer mask를 checkbox에 적용한 뒤 반드시 `Run selected placement`로 재검증한다.

## 그다음

동일 과정을 20-Hi, 24-Hi에서 반복한다.

최종 보고서에서는 각 stack count마다:
- baseline
- selected replacement
- all modified
- modified die fraction
- absolute bow improvement
- bow capture
- absolute Tmax improvement
- thermal capture
- chosen layers

을 표 하나로 정리하는 것을 권장한다.
