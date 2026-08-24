# Final v11 changes

- Locked main AlN cross-section at 1.0 µm depth / 2.0 µm width.
- Kept AlN E=300 GPa, k=200 W/mK, +400 MPa tensile nominal and +300/+400/+500 MPa sensitivity.
- Added literature-benchmark 3-way thermal architecture comparison:
  1. conventional µ-bump + underfill (R″ 4.2 mm²·K/W)
  2. HCB baseline (R″ 1.2 mm²·K/W)
  3. HCB + selected AlN reinforcement
- Default bonded-stack thermal solver now uses the same effective HCB R″=1.2 mm²·K/W, so standard stack thermal output and architecture comparison are consistent.
- Added automatic 16/20/24-Hi architecture table/chart to Complete Study.
- Added optional 24-Hi grid-21 architecture verification button.
- Added external SK hynix 22.8% real-HBM thermal-resistance sanity reference; not used as a fitted target.
- Added architecture regression tests.
