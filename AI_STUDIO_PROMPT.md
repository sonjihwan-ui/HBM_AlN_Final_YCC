# Google AI Studio compatibility instruction — FINAL 10.0 LOCKED

Keep this app as a zero-dependency vanilla ES-module + Node HTTP/SPA project.

Compatibility edits may change server/package wiring, but DO NOT change the locked physics/design assumptions below:

- AlN depth = 2.0 µm
- AlN rib width = 4.0 µm
- AlN residual stress nominal = +400 MPa tensile
- residual-stress sensitivity = +300 / +400 / +500 MPa only
- AlN E = 300 GPa
- AlN k = 200 W/mK
- Si k = 149 W/mK
- universal 360° AlN collar around every occupied TSV over the common 2.0 µm liner-recess segment
- SiO2 liner remains below the AlN segment
- front/back aggregate residual stress remains disabled
- depth/width must not be reintroduced as optimization knobs

Do not rewrite src/topology.js, src/mechanics.js, src/thermal.js, src/stack.js, src/selective.js, src/doe.js or src/finalStudy.js unless required for a demonstrated compatibility bug.

Run `npm test` after compatibility changes. Expected: **66/66 PASS**.
