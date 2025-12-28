import { FEATURES, U } from "./constants.js";

export function createExporters(options) {
  const { state, geometry, getEntitiesForFeature } = options;
  const { sampleArc3, sampleCircle, mmToU, uToMM, angle, mod2pi, circleFrom3 } = geometry;

  function flattenFeaturePoints(feature, sampleStep_u) {
    const out = []; // {x_mm,y_mm, src, editable?, entId?}

    for (const e of getEntitiesForFeature(feature)) {
      if (e.type === "POINT") {
        out.push({ x_mm: e.p.x_mm, y_mm: e.p.y_mm, src: `POINT#${e.id}`, editable: true, entId: e.id });
      } else if (e.type === "LINE") {
        out.push({ x_mm: e.A.x_mm, y_mm: e.A.y_mm, src: `LINE#${e.id}:A` });
        out.push({ x_mm: e.B.x_mm, y_mm: e.B.y_mm, src: `LINE#${e.id}:B` });
      } else if (e.type === "POLYLINE") {
        if (Array.isArray(e.pts)) {
          e.pts.forEach((p, idx) => out.push({ x_mm: p.x_mm, y_mm: p.y_mm, src: `POLY#${e.id}:${idx + 1}` }));
          if (e.closed && e.pts.length > 1) {
            const p0 = e.pts[0];
            out.push({ x_mm: p0.x_mm, y_mm: p0.y_mm, src: `POLY#${e.id}:CLOSE` });
          }
        }
      } else if (e.type === "ARC3") {
        const res = sampleArc3(e.S, e.M, e.E, sampleStep_u);
        if (res) res.pts.forEach((p, idx) => out.push({ x_mm: p.x_mm, y_mm: p.y_mm, src: `ARC#${e.id}:${idx + 1}` }));
      } else if (e.type === "CIRCLE2") {
        const res = sampleCircle(e.C, e.RP, sampleStep_u);
        if (res) res.pts.forEach((p, idx) => out.push({ x_mm: p.x_mm, y_mm: p.y_mm, src: `CIRC#${e.id}:${idx + 1}` }));
      }
    }
    return out;
  }

  function exportWaypointsCSV(feature, sampleStep_u) {
    const pts = flattenFeaturePoints(feature, sampleStep_u);
    const d = U[state.units].decimals;
    const lines = ["N,X,Y,UNITS,SRC"];
    pts.forEach((p, i) => {
      lines.push(`${i + 1},${mmToU(p.x_mm).toFixed(d)},${mmToU(p.y_mm).toFixed(d)},${state.units},${p.src}`);
    });
    return lines.join("\n");
  }

  function exportSegmentsCSV(feature) {
    const ents = getEntitiesForFeature(feature);
    const d = U[state.units].decimals;
    let n = 0;
    const lines = ["N,ACTION,X,Y,I,J,UNITS,SRC"];

    for (const e of ents) {
      // DRILL: independent points (hole centers)
      if (feature === "DRILL") {
        if (e.type === "POINT") {
          n++;
          lines.push(`${n},DRILL_POINT,${mmToU(e.p.x_mm).toFixed(d)},${mmToU(e.p.y_mm).toFixed(d)},,,${state.units},POINT#${e.id}`);
        }
        // DRILL circles are possible later; for now, treat as reference-only.
        continue;
      }

      // POINT in non-DRILL features: marker/reference
      if (e.type === "POINT") {
        n++;
        lines.push(`${n},POINT,${mmToU(e.p.x_mm).toFixed(d)},${mmToU(e.p.y_mm).toFixed(d)},,,${state.units},POINT#${e.id}`);
        continue;
      }

      // LINE: single segment to B (start A is in SRC for clarity)
      if (e.type === "LINE") {
        n++;
        lines.push(`${n},FEED_TO,${mmToU(e.B.x_mm).toFixed(d)},${mmToU(e.B.y_mm).toFixed(d)},,,${state.units},LINE#${e.id}:A(${mmToU(e.A.x_mm).toFixed(d)},${mmToU(e.A.y_mm).toFixed(d)})`);
        continue;
      }

      // POLYLINE: feed segments vertex-to-vertex; optionally close
      if (e.type === "POLYLINE") {
        if (!e.pts || e.pts.length < 2) continue;
        for (let i = 1; i < e.pts.length; i++) {
          n++;
          lines.push(`${n},FEED_TO,${mmToU(e.pts[i].x_mm).toFixed(d)},${mmToU(e.pts[i].y_mm).toFixed(d)},,,${state.units},POLY#${e.id}:${i + 1}`);
        }
        if (e.closed) {
          n++;
          lines.push(`${n},FEED_TO,${mmToU(e.pts[0].x_mm).toFixed(d)},${mmToU(e.pts[0].y_mm).toFixed(d)},,,${state.units},POLY#${e.id}:CLOSE`);
        }
        continue;
      }

      // ARC3: derive center + direction, then emit one arc row with I,J from start.
      if (e.type === "ARC3") {
        const circ = circleFrom3(e.S, e.M, e.E);
        if (!circ) continue;
        const { cx, cy } = circ;

        const aS = angle(cx, cy, e.S.x_mm, e.S.y_mm);
        const aM = angle(cx, cy, e.M.x_mm, e.M.y_mm);
        const aE = angle(cx, cy, e.E.x_mm, e.E.y_mm);
        const sweepSE = mod2pi(aE - aS);
        const sweepSM = mod2pi(aM - aS);
        const ccw = sweepSM <= sweepSE;

        const I = cx - e.S.x_mm;
        const J = cy - e.S.y_mm;
        const action = ccw ? "ARC_CCW_TO" : "ARC_CW_TO";
        n++;
        lines.push(`${n},${action},${mmToU(e.E.x_mm).toFixed(d)},${mmToU(e.E.y_mm).toFixed(d)},${mmToU(I).toFixed(d)},${mmToU(J).toFixed(d)},${state.units},ARC3#${e.id}`);
        continue;
      }

      // CIRCLE2: single semantic row (center + R)
      if (e.type === "CIRCLE2") {
        const r = Math.hypot(e.RP.x_mm - e.C.x_mm, e.RP.y_mm - e.C.y_mm);
        n++;
        lines.push(`${n},CIRCLE_CENTER_R,${mmToU(e.C.x_mm).toFixed(d)},${mmToU(e.C.y_mm).toFixed(d)},${mmToU(r).toFixed(d)},,${state.units},CIRCLE2#${e.id}`);
        continue;
      }
    }

    return lines.join("\n");
  }

  function exportPointsCSV(featureList, sampleStep_u) {
    const d = U[state.units].decimals;
    const lines = ["FEATURE,N,X,Y,UNITS,SRC"];
    for (const f of featureList) {
      const pts = flattenFeaturePoints(f, sampleStep_u);
      pts.forEach((p, i) => {
        lines.push(`${f},${i + 1},${mmToU(p.x_mm).toFixed(d)},${mmToU(p.y_mm).toFixed(d)},${state.units},${p.src}`);
      });
    }
    return lines.join("\n");
  }

  function exportGcode(featureList) {
    let lines = ["(PlotOMatic G-code export)", "G90 ; absolute distance mode", "G21 ; mm units"];

    for (const f of featureList) {
      const ents = getEntitiesForFeature(f);

      for (const e of ents) {
        if (e.type === "POINT") {
          lines.push(`(POINT#${e.id}) G0 X${mmToU(e.p.x_mm).toFixed(U[state.units].decimals)} Y${mmToU(e.p.y_mm).toFixed(U[state.units].decimals)}`);
          continue;
        }
        if (e.type === "LINE") {
          lines.push(`(LINE#${e.id})`);
          lines.push(`G0 X${mmToU(e.A.x_mm).toFixed(U[state.units].decimals)} Y${mmToU(e.A.y_mm).toFixed(U[state.units].decimals)}`);
          lines.push(`G1 X${mmToU(e.B.x_mm).toFixed(U[state.units].decimals)} Y${mmToU(e.B.y_mm).toFixed(U[state.units].decimals)}`);
          continue;
        }
        if (e.type === "POLYLINE") {
          if (!e.pts || e.pts.length < 2) continue;
          lines.push(`(POLY#${e.id})`);
          lines.push(`G0 X${mmToU(e.pts[0].x_mm).toFixed(U[state.units].decimals)} Y${mmToU(e.pts[0].y_mm).toFixed(U[state.units].decimals)}`);
          for (let i = 1; i < e.pts.length; i++) {
            lines.push(`G1 X${mmToU(e.pts[i].x_mm).toFixed(U[state.units].decimals)} Y${mmToU(e.pts[i].y_mm).toFixed(U[state.units].decimals)}`);
          }
          if (e.closed) {
            lines.push(`G1 X${mmToU(e.pts[0].x_mm).toFixed(U[state.units].decimals)} Y${mmToU(e.pts[0].y_mm).toFixed(U[state.units].decimals)} ; close`);
          }
          continue;
        }
        if (e.type === "ARC3") {
          const circ = circleFrom3(e.S, e.M, e.E);
          if (!circ) continue;
          const { cx, cy } = circ;

          const aS = angle(cx, cy, e.S.x_mm, e.S.y_mm);
          const aM = angle(cx, cy, e.M.x_mm, e.M.y_mm);
          const aE = angle(cx, cy, e.E.x_mm, e.E.y_mm);
          const sweepSE = mod2pi(aE - aS);
          const sweepSM = mod2pi(aM - aS);
          const ccw = sweepSM <= sweepSE;

          const I = cx - e.S.x_mm;
          const J = cy - e.S.y_mm;
          const cmd = ccw ? "G3" : "G2";
          lines.push(`(ARC3#${e.id})`);
          lines.push(`G0 X${mmToU(e.S.x_mm).toFixed(U[state.units].decimals)} Y${mmToU(e.S.y_mm).toFixed(U[state.units].decimals)}`);
          lines.push(`${cmd} X${mmToU(e.E.x_mm).toFixed(U[state.units].decimals)} Y${mmToU(e.E.y_mm).toFixed(U[state.units].decimals)} I${mmToU(I).toFixed(U[state.units].decimals)} J${mmToU(J).toFixed(U[state.units].decimals)}`);
          continue;
        }
        if (e.type === "CIRCLE2") {
          const circ = sampleCircle(e.C, e.RP, state.gridStep_u);
          if (!circ) continue;
          lines.push(`(CIRCLE2#${e.id})`);
          if (circ.pts.length > 0) {
            lines.push(`G0 X${mmToU(circ.pts[0].x_mm).toFixed(U[state.units].decimals)} Y${mmToU(circ.pts[0].y_mm).toFixed(U[state.units].decimals)}`);
            for (let i = 1; i < circ.pts.length; i++) {
              const p = circ.pts[i];
              lines.push(`G1 X${mmToU(p.x_mm).toFixed(U[state.units].decimals)} Y${mmToU(p.y_mm).toFixed(U[state.units].decimals)}`);
            }
          }
          continue;
        }
      }
    }

    lines.push("M2");
    return lines.join("\n");
  }

  function exportPseudoMaticIR(featureList, irPurpose, irStrategy) {
    const lines = [
      "{",
      `  \"purpose\": \"${irPurpose}\",`,
      `  \"z_strategy\": \"${irStrategy}\",`,
      '  "features": {',
    ];

    featureList.forEach((f, fidx) => {
      const ents = getEntitiesForFeature(f);
      lines.push(`    "${f}": [`);

      ents.forEach((e, idx) => {
        const end = idx === ents.length - 1 ? "" : ",";
        if (e.type === "POINT") {
          lines.push(`      {"type":"POINT","x":${e.p.x_mm.toFixed(4)},"y":${e.p.y_mm.toFixed(4)}}${end}`);
        } else if (e.type === "LINE") {
          lines.push(`      {"type":"LINE","ax":${e.A.x_mm.toFixed(4)},"ay":${e.A.y_mm.toFixed(4)},"bx":${e.B.x_mm.toFixed(4)},"by":${e.B.y_mm.toFixed(4)}}${end}`);
        } else if (e.type === "POLYLINE") {
          const pts = (e.pts || []).map((p) => `{"x":${p.x_mm.toFixed(4)},"y":${p.y_mm.toFixed(4)}}`).join(",");
          lines.push(`      {"type":"POLYLINE","closed":${!!e.closed},"pts":[${pts}]}${end}`);
        } else if (e.type === "ARC3") {
          lines.push(`      {"type":"ARC3","sx":${e.S.x_mm.toFixed(4)},"sy":${e.S.y_mm.toFixed(4)},"mx":${e.M.x_mm.toFixed(4)},"my":${e.M.y_mm.toFixed(4)},"ex":${e.E.x_mm.toFixed(4)},"ey":${e.E.y_mm.toFixed(4)}}${end}`);
        } else if (e.type === "CIRCLE2") {
          lines.push(`      {"type":"CIRCLE2","cx":${e.C.x_mm.toFixed(4)},"cy":${e.C.y_mm.toFixed(4)},"rx":${e.RP.x_mm.toFixed(4)},"ry":${e.RP.y_mm.toFixed(4)}}${end}`);
        }
      });

      lines.push(`    ]${fidx === featureList.length - 1 ? "" : ","}`);
    });

    lines.push("  }");
    lines.push("}");
    return lines.join("\n");
  }

  function exportTeachingPseudo(featureList) {
    const d = U[state.units].decimals;
    const lines = ["# Teaching Pseudocode export"];

    for (const f of featureList) {
      const ents = getEntitiesForFeature(f);
      lines.push("");
      lines.push(`# FEATURE: ${f}`);

      for (const e of ents) {
        if (e.type === "POINT") {
          lines.push(`POINT ${mmToU(e.p.x_mm).toFixed(d)}, ${mmToU(e.p.y_mm).toFixed(d)}   # id:${e.id}`);
          continue;
        }
        if (e.type === "LINE") {
          lines.push(`LINE ${mmToU(e.A.x_mm).toFixed(d)}, ${mmToU(e.A.y_mm).toFixed(d)}  ->  ${mmToU(e.B.x_mm).toFixed(d)}, ${mmToU(e.B.y_mm).toFixed(d)}   # id:${e.id}`);
          continue;
        }
        if (e.type === "POLYLINE") {
          if (!e.pts || e.pts.length < 2) continue;
          const ptsStr = e.pts.map((p) => `${mmToU(p.x_mm).toFixed(d)}, ${mmToU(p.y_mm).toFixed(d)}`).join("  ->  ");
          lines.push(`POLYLINE ${ptsStr}${e.closed ? "  -> (close)" : ""}   # id:${e.id}`);
          continue;
        }
        if (e.type === "ARC3") {
          lines.push(`ARC3 ${mmToU(e.S.x_mm).toFixed(d)}, ${mmToU(e.S.y_mm).toFixed(d)}  through  ${mmToU(e.M.x_mm).toFixed(d)}, ${mmToU(e.M.y_mm).toFixed(d)}  to  ${mmToU(e.E.x_mm).toFixed(d)}, ${mmToU(e.E.y_mm).toFixed(d)}   # id:${e.id}`);
          continue;
        }
        if (e.type === "CIRCLE2") {
          const r = Math.hypot(e.RP.x_mm - e.C.x_mm, e.RP.y_mm - e.C.y_mm);
          lines.push(`CIRCLE  center ${mmToU(e.C.x_mm).toFixed(d)}, ${mmToU(e.C.y_mm).toFixed(d)}  radius ${mmToU(r).toFixed(d)}   # id:${e.id}`);
          continue;
        }
      }
    }
    return lines.join("\n");
  }

  function exportPointsForFeatures(featureList, sampleStep_u) {
    return exportPointsCSV(featureList, sampleStep_u);
  }

  return {
    flattenFeaturePoints,
    exportWaypointsCSV,
    exportSegmentsCSV,
    exportPointsForFeatures,
    exportGcode,
    exportPseudoMaticIR,
    exportTeachingPseudo,
  };
}
