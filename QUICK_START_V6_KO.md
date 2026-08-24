# V6 Google AI Studio / GitHub Quick Start

1. ZIP을 풀고 전체 폴더를 GitHub repo에 업로드
2. Google AI Studio에서 repo import
3. AI Studio가 runtime migration을 제안해도 numerical `src/*.js`를 generic demo로 교체하지 않게 함
4. 터미널에서:

```bash
npm install
npm test
npm run dev
```

5. Expected: **51/51 PASS**
6. V5.3 final candidate를 먼저 만들거나, 현재 main AlN design을 modified die로 사용
7. V6에서 16/20/24-Hi 선택
8. `Run one-layer sensitivity scan`
9. `Compare placement presets`
10. checkbox로 관심 layer 선택
11. `Run selected placement`로 exact final bow / thermal 확인
12. `Run 1→N cumulative bow`
13. `Build minimum-replacement plan`

주의:
- preset/plan thermal은 fast screening estimate
- `Run selected placement` thermal은 exact reduced-order stack solve at current stack grid
- actual yield %는 출력하지 않음
