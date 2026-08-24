# V6 Verification Report

Verification date: 2026-08-24

## Automated regression

`npm test`

- Core physics: 24/24 PASS
- V5.3 DOE: 14/14 PASS
- V6 selective deployment: 13/13 PASS
- **Total: 51/51 PASS**

See `TEST_OUTPUT_V6.txt`.

## Syntax

All JavaScript modules and tests passed `node --check`.

## HTTP smoke test

- `/` -> 200
- `/src/app.js` -> 200
- `/src/selective.js` -> 200
- `/src/stack.js` -> 200

## V6 endpoint consistency

Automated tests verify:

- masked all-baseline mechanics == legacy no-AlN stack endpoint
- masked all-modified mechanics == legacy all-AlN endpoint
- masked all-baseline thermal == legacy no-AlN endpoint
- masked all-modified thermal == legacy all-AlN endpoint

This is important because V6 extends rather than replaces the V5.3 stack engine.

## Cumulative mechanics

Automated tests verify:
- Layer 1 -> N stage count
- each stage uses the truncated current mask
- modified count accumulates correctly

## Thermal

Automated tests verify:
- selective layer temperature arrays have N entries
- energy balance remains within 1%

## Performance architecture

Exact final selected placement uses the normal `stackGrid`.

For 24-Hi, repeated exact thermal solution for every possible deployment prefix is unnecessarily expensive. Therefore V6 intentionally uses:

- exact coarse-grid one-layer thermal sensitivity
- additive thermal estimates for preset and minimum-replacement screening
- exact final verification through `Run selected placement`

This distinction is explicit in UI and documentation.

## Important numerical interpretation

Selective placement can outperform the all-modified benchmark in the reduced-order mechanical model. In that case benefit capture may exceed 100%. This is not clamped.

Likewise a selective mask can worsen bow relative to baseline, giving negative capture.

Because the all-modified absolute improvement can sometimes be small, always report:
1. absolute baseline -> selective improvement
2. absolute baseline -> all-modified improvement
3. capture ratio

together.

## Readiness

**READY FOR V6 DESIGN-SCREENING: YES**

**READY FOR CLAIMING ACTUAL HBM MANUFACTURING YIELD %: NO**

**READY FOR CLAIMING FULL PROCESS-HISTORY FEM EQUIVALENCE: NO**
