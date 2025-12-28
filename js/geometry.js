import { U } from "./constants.js";

export function createGeometry(state, canvas) {
  const viewHeight_u = () => state.viewWidth_u * (canvas.height / canvas.width);

  const uToMM = (v_u) => v_u * U[state.units].toMM;
  const mmToU = (v_mm) => v_mm / U[state.units].toMM;

  function w2s_world_mm(x_mm, y_mm) {
    const vw_mm = uToMM(state.viewWidth_u);
    const vh_mm = uToMM(viewHeight_u());
    const xmin = state.center_world_mm.x - vw_mm / 2;
    const ymin = state.center_world_mm.y - vh_mm / 2;
    const sx = ((x_mm - xmin) / vw_mm) * canvas.width;
    const sy = canvas.height - ((y_mm - ymin) / vh_mm) * canvas.height;
    return { sx, sy };
  }

  function s2w_world_mm(sx, sy) {
    const vw_mm = uToMM(state.viewWidth_u);
    const vh_mm = uToMM(viewHeight_u());
    const xmin = state.center_world_mm.x - vw_mm / 2;
    const ymin = state.center_world_mm.y - vh_mm / 2;
    const x_mm = xmin + (sx / canvas.width) * vw_mm;
    const y_mm = ymin + ((canvas.height - sy) / canvas.height) * vh_mm;
    return { x_mm, y_mm };
  }

  function worldToRec_mm(xw, yw) {
    if (state.coordFlavor === "haas") {
      return { x_mm: xw - state.workZero_world_mm.x, y_mm: yw - state.workZero_world_mm.y };
    }
    return { x_mm: xw, y_mm: yw };
  }

  function recToWorld_mm(x, y) {
    if (state.coordFlavor === "haas") {
      return { xw_mm: x + state.workZero_world_mm.x, yw_mm: y + state.workZero_world_mm.y };
    }
    return { xw_mm: x, yw_mm: y };
  }

  const roundToStep = (value_u, step_u) => Math.round(value_u / step_u) * step_u;

  function snapRec(rec, snapEnabled) {
    if (!snapEnabled) return rec;
    let x_u = mmToU(rec.x_mm);
    let y_u = mmToU(rec.y_mm);
    x_u = roundToStep(x_u, state.gridStep_u);
    y_u = roundToStep(y_u, state.gridStep_u);
    return { x_mm: uToMM(x_u), y_mm: uToMM(y_u) };
  }

  function circleFrom3(p1, p2, p3) {
    const x1 = p1.x_mm, y1 = p1.y_mm;
    const x2 = p2.x_mm, y2 = p2.y_mm;
    const x3 = p3.x_mm, y3 = p3.y_mm;
    const a = x1 * (y2 - y3) - y1 * (x2 - x3) + x2 * y3 - x3 * y2;
    if (Math.abs(a) < 1e-10) return null;
    const b = (x1 * x1 + y1 * y1) * (y3 - y2) + (x2 * x2 + y2 * y2) * (y1 - y3) + (x3 * x3 + y3 * y3) * (y2 - y1);
    const c = (x1 * x1 + y1 * y1) * (x2 - x3) + (x2 * x2 + y2 * y2) * (x3 - x1) + (x3 * x3 + y3 * y3) * (x1 - x2);
    const cx = -b / (2 * a);
    const cy = -c / (2 * a);
    const r = Math.hypot(cx - x1, cy - y1);
    return { cx, cy, r };
  }

  const angle = (cx, cy, x, y) => Math.atan2(y - cy, x - cx);
  const mod2pi = (t) => {
    const two = 2 * Math.PI;
    t = t % two;
    if (t < 0) t += two;
    return t;
  };

  function sampleArc3(pS, pM, pE, step_u) {
    const circ = circleFrom3(pS, pM, pE);
    if (!circ) return null;
    const { cx, cy, r } = circ;
    const aS = angle(cx, cy, pS.x_mm, pS.y_mm);
    const aM = angle(cx, cy, pM.x_mm, pM.y_mm);
    const aE = angle(cx, cy, pE.x_mm, pE.y_mm);
    const sweepSE = mod2pi(aE - aS);
    const sweepSM = mod2pi(aM - aS);
    const ccw = sweepSM <= sweepSE;
    const sweep = ccw ? sweepSE : mod2pi(aS - aE);

    const step_mm = uToMM(step_u);
    const arcLen = r * sweep;
    const n = Math.max(6, Math.ceil(arcLen / step_mm) + 1);

    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ang = ccw ? aS + t * sweepSE : aS - t * mod2pi(aS - aE);
      pts.push({ x_mm: cx + r * Math.cos(ang), y_mm: cy + r * Math.sin(ang) });
    }
    return { ccw, cx, cy, r, pts };
  }

  function sampleCircle(center, radPt, step_u) {
    const cx = center.x_mm, cy = center.y_mm;
    const r = Math.hypot(radPt.x_mm - cx, radPt.y_mm - cy);
    if (r < 1e-10) return null;

    const step_mm = uToMM(step_u);
    const circ = 2 * Math.PI * r;
    const n = Math.max(24, Math.ceil(circ / step_mm));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const ang = (i / n) * 2 * Math.PI;
      out.push({ x_mm: cx + r * Math.cos(ang), y_mm: cy + r * Math.sin(ang) });
    }
    return { cx, cy, r, pts: out };
  }

  return {
    uToMM,
    mmToU,
    viewHeight_u,
    w2s_world_mm,
    s2w_world_mm,
    worldToRec_mm,
    recToWorld_mm,
    roundToStep,
    snapRec,
    circleFrom3,
    angle,
    mod2pi,
    sampleArc3,
    sampleCircle,
  };
}

export function regularVertices_mm(cx_mm, cy_mm, r_mm, n, startDeg = 0) {
  const a0 = (startDeg || 0) * Math.PI / 180;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + i * (2 * Math.PI / n);
    pts.push({ x_mm: cx_mm + r_mm * Math.cos(a), y_mm: cy_mm + r_mm * Math.sin(a) });
  }
  return pts;
}
