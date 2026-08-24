import { THERMAL_ARCHITECTURE_BENCHMARKS as B } from './constants.js';
import { stackThermalMaskedWithInterfaceR } from './stack.js';

function effRthKPerW(cfg, result){
  return result.totalPowerW>0 ? (result.tmax-cfg.ambientC)/result.totalPowerW : NaN;
}

export function interconnectThermalComparison(cfg,N,modifiedMask,gridOverride=null){
  const mask=Array.from({length:N},(_,i)=>!!modifiedMask?.[i]);
  const baseMask=Array(N).fill(false);
  const c = gridOverride==null ? cfg : {...cfg,stackGrid:gridOverride};

  // The literature benchmark values are treated as complete equivalent inter-die
  // area-normalized resistances. Do not add the legacy bond-layer t/k term again.
  const micro = stackThermalMaskedWithInterfaceR(c,baseMask,B.microBumpUnderfillRarea);
  const hcb = stackThermalMaskedWithInterfaceR(c,baseMask,B.hybridBondingRarea);
  const proposed = stackThermalMaskedWithInterfaceR(c,mask,B.hybridBondingRarea);

  const rMicro=effRthKPerW(c,micro), rHcb=effRthKPerW(c,hcb), rProposed=effRthKPerW(c,proposed);
  const hcbDeltaK=micro.tmax-hcb.tmax;
  const proposedDeltaK=hcb.tmax-proposed.tmax;
  const hcbRthReductionPct=Number.isFinite(rMicro)&&rMicro>0 ? 100*(rMicro-rHcb)/rMicro : NaN;
  const proposedRthReductionVsMicroPct=Number.isFinite(rMicro)&&rMicro>0 ? 100*(rMicro-rProposed)/rMicro : NaN;

  return {
    N,grid:c.stackGrid,modifiedMask:mask,modifiedCount:mask.filter(Boolean).length,
    benchmark:{...B},
    microBumpUnderfill:{...micro,effectiveRthKPerW:rMicro},
    hybridBaseline:{...hcb,effectiveRthKPerW:rHcb},
    proposedHcbAln:{...proposed,effectiveRthKPerW:rProposed},
    hcbDeltaK,hcbRthReductionPct,proposedDeltaK,proposedRthReductionVsMicroPct,
    totalPowerW:micro.totalPowerW,
    maxEnergyErrorPct:Math.max(Math.abs(micro.energyErrorPct),Math.abs(hcb.energyErrorPct),Math.abs(proposed.energyErrorPct))
  };
}
