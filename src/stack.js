import { MATERIALS } from "./constants.js";
import { frontSkinProps, backSkinProps, areaAverageBodyProps } from "./homogenization.js";
import { tsvAreaFraction, baseProxyZones, pointInRect } from "./geometry.js";
import { buildTopology } from "./topology.js";
import { buildThermalMaps } from "./thermal.js";

function solve2(A,B,D,N,M){
  const det=A*D-B*B;
  if(Math.abs(det)<1e-30) throw new Error("Singular stack laminate matrix");
  return { eps0:(N*D-B*M)/det, kappa:(A*M-B*N)/det };
}
function q(E,nu){ return E/(1-nu*nu); }
function harmonic(a,b){ return 2*a*b/Math.max(a+b,1e-30); }

export function normalizeModifiedMask(maskOrBool,Ndie){
  if(Array.isArray(maskOrBool)) return Array.from({length:Ndie},(_,i)=>!!maskOrBool[i]);
  return Array(Ndie).fill(!!maskOrBool);
}

function scalarStackDirection(cfg,Ndie,dir,maskOrBool,applyCalibration=true){
  const modifiedMask=normalizeModifiedMask(maskOrBool,Ndie);
  const anyModified=modifiedMask.some(Boolean);
  const front=frontSkinProps(cfg), back=backSkinProps(cfg);
  const body=areaAverageBodyProps(cfg,tsvAreaFraction(cfg));
  const topo=buildTopology(cfg,anyModified);
  const tf=cfg.frontT*1e-6, ts=cfg.siBodyT*1e-6, tb=cfg.backT*1e-6;
  const bondT=cfg.bondTUm*1e-6, dieT=cfg.totalDieT*1e-6;
  const total=Ndie*dieT+Math.max(0,Ndie-1)*bondT;
  let z=-total/2, A=0,B=0,D=0,Nr=0,Mr=0;

  const addLayer=(t,mat,eps=0)=>{
    const z1=z,z2=z+t; z=z2;
    const Q=q(mat.E,mat.nu);
    A+=Q*(z2-z1); B+=Q*(z2*z2-z1*z1)/2; D+=Q*(z2*z2*z2-z1*z1*z1)/3;
    Nr+=Q*eps*(z2-z1); Mr+=Q*eps*(z2*z2-z1*z1)/2;
  };
  const addAlnMembrane=(zmid,teq,enabled)=>{
    if(!enabled || teq<=0) return;
    const Qa=q(MATERIALS.aln.E,MATERIALS.aln.nu), Qsi=q(MATERIALS.si.E,MATERIALS.si.nu);
    const dQ=cfg.alnEmbeddingMode==="additive"?Qa:(Qa-Qsi);
    const eps=(MATERIALS.aln.alpha-MATERIALS.si.alpha)*(cfg.finalC-cfg.alnProcessC);
    const sig=cfg.alnResidualMPa*1e6;
    A+=dQ*teq; B+=dQ*teq*zmid; D+=dQ*teq*(zmid*zmid+teq*teq/12);
    Nr+=Qa*eps*teq+sig*teq; Mr+=(Qa*eps+sig)*teq*zmid;
  };

  const epsFront=(front.alpha-MATERIALS.si.alpha)*(cfg.finalC-cfg.frontProcessC)+(cfg.frontResidualMPa*1e6)/Math.max(front.E,1);
  const epsBack=(back.alpha-MATERIALS.si.alpha)*(cfg.finalC-cfg.backProcessC)+(cfg.backResidualMPa*1e6)/Math.max(back.E,1);
  const epsBody=(body.alpha-MATERIALS.si.alpha)*(cfg.finalC-cfg.tsvRefC);
  const bond={E:cfg.bondE_GPa*1e9,nu:cfg.bondNu,alpha:cfg.bondCTE_ppm*1e-6};
  const epsBond=(bond.alpha-MATERIALS.si.alpha)*(cfg.finalC-cfg.backProcessC);
  const teq=(dir==="x"?topo.areaFracX:topo.areaFracY)*(cfg.alnTUm*1e-6);

  for(let d=0;d<Ndie;d++){
    const modified=modifiedMask[d];
    const mirrored=cfg.stackOrientation==="alternating" && (d%2===1);
    if(!mirrored){
      addLayer(tb,back,epsBack);
      const bodyBottom=z; addLayer(ts,body,epsBody);
      addAlnMembrane(bodyBottom+cfg.alnZ*ts,teq,modified);
      addLayer(tf,front,epsFront);
    }else{
      addLayer(tf,front,epsFront);
      const bodyBottom=z; addLayer(ts,body,epsBody);
      addAlnMembrane(bodyBottom+(1-cfg.alnZ)*ts,teq,modified);
      addLayer(tb,back,epsBack);
    }
    if(d<Ndie-1) addLayer(bondT,bond,epsBond);
  }

  if(cfg.mechMode==="calibrated" && applyCalibration){
    const single=scalarStackDirection(cfg,1,dir,false,false);
    const L=cfg.coreSize*1e-3;
    const target=cfg.warpSign*4*(cfg.w0Um*1e-6)/(L*L);
    const compliance=single.A/(single.A*single.D-single.B*single.B);
    const dMper=Math.abs(compliance)>1e-30?(target-single.kappa)/compliance:0;
    Mr+=Ndie*dMper;
  }
  const sol=solve2(A,B,D,Nr,Mr);
  return {...sol,A,B,D,total,topo,modifiedMask};
}

function bowFromCurvature(kx,ky,Lmm){
  const a=Lmm*1e-3/2;
  const vals=[0,0.5*kx*a*a,0.5*ky*a*a,0.5*(kx+ky)*a*a];
  return (Math.max(...vals)-Math.min(...vals))*1e6;
}

export function stackMechanicalMasked(cfg,modifiedMask){
  const Ndie=modifiedMask.length;
  if(Ndie<1) throw new Error("Stack must contain at least one core die");
  const x=scalarStackDirection(cfg,Ndie,"x",modifiedMask);
  const y=scalarStackDirection(cfg,Ndie,"y",modifiedMask);
  const bow=bowFromCurvature(x.kappa,y.kappa,cfg.coreSize);
  const L=cfg.coreSize*1e-3, a=L/2;
  const xEdgeUm=0.5*x.kappa*a*a*1e6, yEdgeUm=0.5*y.kappa*a*a*1e6;
  return {
    N:Ndie,modifiedMask:[...modifiedMask],modifiedCount:modifiedMask.filter(Boolean).length,
    kx:x.kappa,ky:y.kappa,bowUm:bow,totalThicknessUm:x.total*1e6,
    xEdgeMinusCenterUm:xEdgeUm,yEdgeMinusCenterUm:yEdgeUm,
    xSectionCenterRelation:xEdgeUm>0?"center lower than edges":xEdgeUm<0?"center higher than edges":"near flat",
    ySectionCenterRelation:yEdgeUm>0?"center lower than edges":yEdgeUm<0?"center higher than edges":"near flat"
  };
}

export function stackMechanicalProjection(cfg,Ndie){
  const current=stackMechanicalMasked(cfg,Array(Ndie).fill(true));
  const noAln=stackMechanicalMasked(cfg,Array(Ndie).fill(false));
  return {
    ...current,noAlnBowUm:noAln.bowUm,
    reductionPct:noAln.bowUm>1e-12?(1-current.bowUm/noAln.bowUm)*100:0
  };
}

function buildBaseHeatMap(cfg,maps,n){
  const nn=n*n,qBase=new Float64Array(nn);
  const basePower=cfg.includeBasePower?(cfg.basePhyPowerW+cfg.baseTsvPowerW):0;
  if(!cfg.includeBasePower || basePower<=0) return {qBase,basePower};
  const proxy=baseProxyZones(),half=cfg.coreSize/2,cellMm=cfg.coreSize/n;
  let nPhy=0,nTsv=0;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const x=-half+(i+0.5)*cellMm,y=-half+(j+0.5)*cellMm;
    if(pointInRect(x,y,proxy.phy))nPhy++; else if(pointInRect(x,y,proxy.tsv))nTsv++;
  }
  const cellArea=(maps.L/n)*(maps.L/n);
  const qPhy=nPhy?cfg.basePhyPowerW/(nPhy*cellArea):0, qTsv=nTsv?cfg.baseTsvPowerW/(nTsv*cellArea):0;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const x=-half+(i+0.5)*cellMm,y=-half+(j+0.5)*cellMm,p=j*n+i;
    if(pointInRect(x,y,proxy.phy))qBase[p]=qPhy; else if(pointInRect(x,y,proxy.tsv))qBase[p]=qTsv;
  }
  return {qBase,basePower};
}

function solveStackThermalMasked(cfg,modifiedMask,interfaceRareaOverride=null){
  const Ndie=modifiedMask.length,n=cfg.stackGrid,nn=n*n,totalNodes=nn*Ndie;
  if(Ndie<1) throw new Error("Stack must contain at least one core die");
  const mapsBase=buildThermalMaps(cfg,n,false), mapsMod=buildThermalMaps(cfg,n,true);
  const layerMaps=modifiedMask.map(v=>v?mapsMod:mapsBase);
  const {qBase,basePower}=buildBaseHeatMap(cfg,mapsBase,n);
  const totalPower=Ndie*(cfg.bankPowerW+cfg.tsvPowerW)+basePower;
  const T=new Float64Array(totalNodes); T.fill(cfg.ambientC+totalPower*cfg.externalRthKW);
  const A=mapsBase.L*mapsBase.L, RextArea=cfg.externalRthKW*A;
  // When bondRarea > 0 it is interpreted as the complete effective inter-die R'' benchmark.
  // If the user deliberately sets it to zero, fall back to the legacy bond-layer t/k surrogate.
  const Rbond=interfaceRareaOverride==null ? (cfg.bondRarea>0 ? cfg.bondRarea : (cfg.bondTUm*1e-6)/Math.max(cfg.bondK,1e-9)) : Math.max(0,Number(interfaceRareaOverride));
  const maxIter=9000,tol=2e-5,omega=1.25;
  let it=0,err=Infinity;

  for(;it<maxIter;it++){
    err=0;
    for(let l=0;l<Ndie;l++){
      const off=l*nn,m=layerMaps[l],dx=m.dx;
      for(let j=0;j<n;j++)for(let i=0;i<n;i++){
        const p=j*n+i,id=off+p;
        let ap=0,rhs=m.q[p]+(l===0?qBase[p]:0);
        if(i>0){const a=harmonic(m.Kx[p],m.Kx[p-1])/(dx*dx);ap+=a;rhs+=a*T[id-1];}
        if(i<n-1){const a=harmonic(m.Kx[p],m.Kx[p+1])/(dx*dx);ap+=a;rhs+=a*T[id+1];}
        if(j>0){const a=harmonic(m.Ky[p],m.Ky[p-n])/(dx*dx);ap+=a;rhs+=a*T[id-n];}
        if(j<n-1){const a=harmonic(m.Ky[p],m.Ky[p+n])/(dx*dx);ap+=a;rhs+=a*T[id+n];}
        if(l>0){
          const ml=layerMaps[l-1],gz=1/Math.max(0.5*m.Rz[p]+Rbond+0.5*ml.Rz[p],1e-30);
          ap+=gz;rhs+=gz*T[id-nn];
        }
        if(l<Ndie-1){
          const mu=layerMaps[l+1],gz=1/Math.max(0.5*m.Rz[p]+Rbond+0.5*mu.Rz[p],1e-30);
          ap+=gz;rhs+=gz*T[id+nn];
        }
        if(l===Ndie-1){
          const gtop=1/Math.max(0.5*m.Rz[p]+RextArea,1e-30);ap+=gtop;rhs+=gtop*cfg.ambientC;
        }
        const raw=rhs/Math.max(ap,1e-30),nv=T[id]+omega*(raw-T[id]);
        err=Math.max(err,Math.abs(nv-T[id]));T[id]=nv;
      }
    }
    if(err<tol)break;
  }

  let tmax=-Infinity,tmin=Infinity,sum=0,imax=0,sink=0;
  const layerMaxC=Array(Ndie).fill(-Infinity),layerMinC=Array(Ndie).fill(Infinity),layerMeanC=Array(Ndie).fill(0);
  for(let l=0;l<Ndie;l++){
    const off=l*nn;
    for(let p=0;p<nn;p++){
      const v=T[off+p];sum+=v;layerMeanC[l]+=v;
      if(v>layerMaxC[l])layerMaxC[l]=v;if(v<layerMinC[l])layerMinC[l]=v;
      if(v>tmax){tmax=v;imax=off+p;}if(v<tmin)tmin=v;
    }
    layerMeanC[l]/=nn;
  }
  const cellArea=A/(n*n),topOff=(Ndie-1)*nn,topMap=layerMaps[Ndie-1];
  for(let p=0;p<nn;p++){
    const gtop=1/Math.max(0.5*topMap.Rz[p]+RextArea,1e-30);
    sink+=gtop*(T[topOff+p]-cfg.ambientC)*cellArea;
  }
  const layer=Math.floor(imax/nn);
  return {
    T,n,N:Ndie,tmax,tmin,mean:sum/T.length,iterations:it+1,error:err,
    hottestLayer:layer+1,totalPowerW:totalPower,sinkW:sink,
    energyErrorPct:totalPower>0?(sink-totalPower)/totalPower*100:0,
    modifiedMask:[...modifiedMask],modifiedCount:modifiedMask.filter(Boolean).length,
    layerMaxC,layerMinC,layerMeanC,mapsBase,mapsMod
  };
}

export function stackThermalMasked(cfg,modifiedMask){
  return solveStackThermalMasked(cfg,modifiedMask);
}

// Thermal-only architecture benchmark: override the complete effective inter-die
// area-normalized resistance R'' [m²K/W]. Mechanical bond properties are unchanged.
export function stackThermalMaskedWithInterfaceR(cfg,modifiedMask,interfaceRarea){
  return solveStackThermalMasked(cfg,modifiedMask,interfaceRarea);
}

export function stackThermalProjection(cfg,Ndie){
  const current=solveStackThermalMasked(cfg,Array(Ndie).fill(true));
  const noAln=solveStackThermalMasked(cfg,Array(Ndie).fill(false));
  return {
    ...current,noAln,
    tmaxReductionC:noAln.tmax-current.tmax,
    tmaxReductionPct:(noAln.tmax-cfg.ambientC)>1e-12?(noAln.tmax-current.tmax)/(noAln.tmax-cfg.ambientC)*100:0
  };
}

export function stackSweep(cfg,counts=[4,8,12,16,20,24],includeThermal=true){
  return counts.map(N=>({N,mech:stackMechanicalProjection(cfg,N),thermal:includeThermal?stackThermalProjection(cfg,N):null}));
}
