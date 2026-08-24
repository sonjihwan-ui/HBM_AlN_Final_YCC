# V5.2 → V5.3 Changelog

## Automated screening / ranking

- Stage 1: V1/V2/V3 × T0~T4 = 15 topology screening
- Stage 2: Top-5 geometry refinement
  - z/t sweep
  - TSV Y-position sweep
  - residual stress sensitivity
- Stage 3: Top-3 robustness analysis
  - W0
  - TSV occupancy
  - SiO2 liner
  - residual stress
- Stage 4: 16/20/24-Hi secondary stack check
- Stage 5: Primary ranking + Pareto + stack tie-breaker

## Ranking safety

- Automatic ranking forcibly uses constant-AlN-volume auto width
- Manual width cannot silently influence the winner
- Feasibility gates for geometry / volume / thermal energy balance
- Negative primary-result warning added
- Winner is marked as `BEST_OF_TESTED_BUT_NO_POSITIVE_PRIMARY_BENEFIT` if warpage criterion ≤ 0

## Result UI

- Five-stage progress indicator
- Stop pipeline control
- Final Candidate Card
- Why-selected automatic explanation
- Final ranking table
- Warpage–thermal Pareto map
- Parameter-sweep tabs for Stage 1–4
- DOE JSON export
- Final free-die convergence verification option
- Optional slower 24-Hi stack-grid verification

## Verification

- Existing physics regression suite retained: 24 tests
- New V5.3 DOE/ranking suite: 14 tests
- Total automated tests: 38
