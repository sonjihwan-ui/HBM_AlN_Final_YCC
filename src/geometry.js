export function tsvAreaReference(cfg) {
  return cfg.tsvW * cfg.tsvH;
}

export function buildTsvZones(cfg) {
  const A = tsvAreaReference(cfg);
  let rects = [];
  if (cfg.tsvShape === "compact") {
    const s = Math.sqrt(A);
    rects = [{ cx: 0, cy: 0, w: s, h: s }];
  } else if (cfg.tsvShape === "aspect") {
    const ar = Math.max(0.2, cfg.tsvAspect);
    const w = Math.sqrt(A * ar);
    const h = Math.sqrt(A / ar);
    rects = [{ cx: 0, cy: 0, w, h }];
  } else if (cfg.tsvShape === "split") {
    const w = cfg.tsvW;
    const h = A / (2 * w);
    const y = cfg.tsvSplitGap / 2 + h / 2;
    rects = [
      { cx: 0, cy: +y, w, h },
      { cx: 0, cy: -y, w, h }
    ];
  } else {
    rects = [{ cx: 0, cy: 0, w: cfg.tsvW, h: cfg.tsvH }];
  }

  return rects.map(r => ({
    ...r,
    cx: r.cx + cfg.tsvShiftX,
    cy: r.cy + cfg.tsvShiftY
  }));
}

export function pointInRect(x, y, r) {
  return Math.abs(x - r.cx) <= r.w / 2 + 1e-12 &&
         Math.abs(y - r.cy) <= r.h / 2 + 1e-12;
}

export function pointInTsvZone(x, y, zones) {
  return zones.some(r => pointInRect(x, y, r));
}

export function tsvAreaFraction(cfg) {
  return tsvAreaReference(cfg) / (cfg.coreSize * cfg.coreSize);
}

export function zonesFitCore(cfg, zones = buildTsvZones(cfg)) {
  const h = cfg.coreSize / 2;
  return zones.every(r =>
    r.cx - r.w / 2 >= -h &&
    r.cx + r.w / 2 <= +h &&
    r.cy - r.h / 2 >= -h &&
    r.cy + r.h / 2 <= +h
  );
}

export function baseProxyZones() {
  // User-measured proxy geometry; TSV band is exactly centered at y=0.
  return {
    die: { w: 11, h: 11 },
    tsv: { cx: 0, cy: 0, w: 10, h: 1.3 },
    phy: { cx: 0, cy: 1.95, w: 8, h: 2.6 },
    da:  { cx: 0, cy: -1.60, w: 8, h: 1.9 }
  };
}
