# Final 9.0 — process-constrained geometry

- Final fabrication rule: AlN rib width = 2 × embedded AlN depth.
- Automated design exploration sweeps depth 1 / 2 / 3 µm, giving widths 2 / 4 / 6 µm.
- Reinforcement is treated as backside-adjacent; z-position is derived automatically rather than optimized independently.
- Actual AlN volume fraction is an output and is no longer forced equal across topology families.
- Universal 360° AlN collar remains around every occupied TSV through the common liner-recess depth.
- Collar recess depth follows the selected 1 / 2 / 3 µm AlN depth; SiO2 liner remains below.
- +400 MPa tensile remains the nominal AlN process stress; 300 / 400 / 500 MPa is retained as process variation.
- 3 µm depth is flagged as a design-sensitivity extrapolation beyond the strongest ~1–2 µm residual-stress literature basis.
- Final workflow remains baseline die → optimized reinforced die → 16/20/24-Hi selective deployment → cost/performance recommendation.
