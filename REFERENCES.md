# Reference / assumption basis — Final v11

## Pre-bond warpage / effective stack
B.S.S. Chandra Rao et al., “Dielectric Stack Optimization for Die-level Warpage Reduction for Chip-to-Wafer Hybrid Bonding,” ECTC 2024. DOI: 10.1109/ECTC51529.2024.00019.

## HBM operating thermal surrogate
Public HBM thermal-analysis literature basis used for the 45 °C ambient, ~2 W/core power split and Si/Cu thermal properties. These values remain comparison inputs rather than proprietary HBM4 specifications.

## Hybrid-bonding thermal architecture benchmark
H. Oprins et al., “3D Wafer-to-Wafer Bonding Thermal Resistance Comparison: Hybrid Cu/Dielectric Bonding versus Dielectric via-Last Bonding,” ITherm 2020. DOI: **10.1109/ITherm45881.2020.9190392**.

HBM thermal review summarizing Oprins et al. reports an equivalent hybrid-bonding interface thermal resistance of **1.2 mm²·K/W** versus **4.2 mm²·K/W** for a 40 µm-pitch, 13 µm-standoff micro-bump stack. These are used as architecture benchmark R″ values.

## Real-HBM HBI sanity reference
K. Kim et al., “C2W Hybrid Bonding Interconnect Technology for Higher Density and Better Thermal Dissipation of High Bandwidth Memory,” ECTC 2023. DOI: **10.1109/ECTC51909.2023.00179**.

The paper reports that, at the same bump density, the HBI structure showed **22.8% lower thermal resistance** than the conventional micro-bump + molded-underfill structure. This value is an external sanity reference only; the simulator does not fit to it.

## AlN material/model boundary
- E_AlN = 300 GPa representative sputtered/thin-film design value.
- k_AlN = 200 W/mK is used as a high-k design target / optimistic assumption.
- nominal +400 MPa tensile is a process-stress design input; +300/+400/+500 MPa is used only for sensitivity.
- The model does not claim that E, k and residual stress were measured simultaneously on one identical AlN specimen.
