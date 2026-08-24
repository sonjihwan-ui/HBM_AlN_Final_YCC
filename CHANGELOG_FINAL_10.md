# Final 10.0 — Locked Process Basis

This is the report-facing locked final configuration.

## Locked AlN process inputs
- Embedded AlN depth: **2.0 µm**
- In-plane rib width: **4.0 µm**
- Vertical placement: backside-adjacent
- Nominal PVD AlN residual stress: **+400 MPa tensile**
- Residual-stress sensitivity only: **+300 / +400 / +500 MPa**
- AlN Young's modulus: **300 GPa** representative sputtered/thin-film value
- AlN thermal conductivity: **200 W/m·K**
- Si thermal conductivity: **149 W/m·K**
- AlN Poisson ratio: 0.245
- AlN CTE: 4.2 ppm/K

Depth and width are no longer optimization variables. The optimizer cannot select a different thickness or residual stress to improve the score.

## Design exploration retained
- 3 reinforcement pattern families
- 5 coverage layouts
- TSV Y-position sensitivity
- +300/+400/+500 MPa AlN residual-stress comparison
- W0 / TSV occupancy / SiO2 liner robustness
- 16/20/24-Hi selective deployment and modified-die fraction trade-off

## TSV isolation model retained
Every occupied TSV is recessed through the same 2.0 µm backside-adjacent segment and receives a 360° AlN collar. SiO2 liner remains below the AlN segment.

## Numerical verification
Default final design screening selects an X-braced/full-die-continuation candidate in the current locked model. Free-die mechanical grid convergence 41→61 is approximately **2.91%**, passing the configured 3% criterion; single-die thermal convergence is approximately **0.002%**.
