# FINAL 10.0 LOCKED audit checklist

Verify without changing the model:

1. AlN process mode always resolves to depth = 1.0 µm and width = 2.0 µm.
2. Main AlN residual stress is +400 MPa tensile.
3. DOE residual-stress sensitivity is fixed to +300/+400/+500 MPa and is not a design-selection knob.
4. MATERIALS.aln.E = 300e9 Pa.
5. MATERIALS.aln.kxy = MATERIALS.aln.kz = 200 W/mK.
6. MATERIALS.si.kxy = MATERIALS.si.kz = 149 W/mK.
7. Every occupied TSV receives the universal 360° AlN collar through the common 2.0 µm recess segment.
8. Aggregate front/back residual-stress inputs remain hidden/zero.
9. The optimizer compares layout/coverage/position, not AlN thickness or width.
10. 16/20/24-Hi selective deployment remains active.
11. `npm test` passes 62/62.
