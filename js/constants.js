export const U = {
  in: { name: "in", toMM: 25.4, decimals: 4 },
  mm: { name: "mm", toMM: 1.0, decimals: 3 },
};

export const FEATURES = ["DRILL", "CONTOUR", "POCKET", "REF"];

export const featureHints = {
  DRILL: "Unconnected points/circles for drilling patterns.",
  CONTOUR: "Connected path entities (polyline/arc).",
  POCKET: "Closed boundaries (polyline/circle) as pocket outlines.",
  REF: "Construction geometry (no export).",
};

export const TOOL_MEANING = {
  POINT: "POINT — click to add a reference marker. (No tool motion in exports.)",
  DRILL: "DRILL — click to add a hole location (symbolic for now; machining later with Z strategy).",
  LINE: "LINE — click Start → End to create a LINE entity (motion in exports).",
  POLYLINE: "POLYLINE — click vertices; Enter or Double‑click to finish; Esc cancels. Use Closed to close back to the first point.",
  ARC3: "ARC (3pt) — click Start → Mid → End to create a 3‑point arc (motion in exports).",
  CIRCLE2: "CIRCLE — click Center → Radius point to create a circle (emits arcs in exports).",
  RECT2: "RECTANGLE — click corner → opposite corner to create an axis‑aligned closed polyline (motion in exports).",
};

export const TOOL_GLOBAL_HINT = "Tip: hold Shift to disable snap for one click.";

export const INITIAL_STATE = {
  units: "in",
  gridStep_u: 0.25,
  majorEvery: 4,
  viewWidth_u: 12,
  coordFlavor: "haas",
  center_world_mm: { x: 0, y: 0 },
  workZero_world_mm: { x: 0, y: 0 },
};
