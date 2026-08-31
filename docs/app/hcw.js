// Read and write .hcw scene files.
//
// The magic string below is the format's own header and has to be written
// exactly, or a scene will not open in the app it came from. Reading and
// writing somebody's existing files is the point — nobody should have to
// abandon years of work to change tools.
//
// The parser keeps every element in document order, including tags this app
// doesn't understand, so a scene saved here survives a round-trip through the
// original the file untouched apart from what was actually edited.

export function parseXML(src) {
  const doc = new DOMParser().parseFromString(src, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("Not a valid scene file: " + err.textContent.trim());
  return fromDOM(doc.documentElement);
}

function fromDOM(el) {
  const node = { tag: el.tagName, children: [], text: null };
  let text = "";
  for (const c of el.childNodes) {
    if (c.nodeType === 1) node.children.push(fromDOM(c));
    else if (c.nodeType === 3 || c.nodeType === 4) text += c.nodeValue;
  }
  if (!node.children.length) node.text = text;
  return node;
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);

export function toXML(node, indent = "") {
  if (!node.children.length) {
    const t = node.text ?? "";
    return t === "" ? `${indent}<${node.tag}/>\n`
                    : `${indent}<${node.tag}>${esc(t)}</${node.tag}>\n`;
  }
  const inner = node.children.map((c) => toXML(c, indent + "  ")).join("");
  return `${indent}<${node.tag}>\n${inner}${indent}</${node.tag}>\n`;
}

// --- node helpers -----------------------------------------------------------

export const child = (n, tag) => n?.children.find((c) => c.tag === tag) || null;
export const kids = (n, tag) => (n ? n.children.filter((c) => c.tag === tag) : []);

export function get(n, tag, fallback = "") {
  const c = child(n, tag);
  return c ? (c.text ?? "") : fallback;
}
export const getNum = (n, tag, d = 0) => {
  const v = parseFloat(get(n, tag, ""));
  return Number.isFinite(v) ? v : d;
};
export const getBool = (n, tag, d = false) => {
  const v = get(n, tag, null);
  return v === null || v === "" ? d : v === "true";
};

export function set(n, tag, value) {
  let c = child(n, tag);
  if (!c) {
    c = { tag, children: [], text: "" };
    n.children.push(c);
  }
  c.children = [];
  c.text = value === null || value === undefined ? "" : String(value);
  return c;
}

export function node(tag, fields = {}, children = []) {
  const n = { tag, children: [], text: children.length ? null : "" };
  for (const [k, v] of Object.entries(fields)) set(n, k, v);
  for (const c of children) n.children.push(c);
  if (n.children.length) n.text = null;
  return n;
}

// --- ids --------------------------------------------------------------------

const hex = (n) =>
  Array.from({ length: n }, () =>
    "0123456789ABCDEF"[(Math.random() * 16) | 0]).join("");

/** A uniqueID in the app's own 8-4-4-4-12 uppercase-hex shape. */
export const newID = () =>
  `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;

// --- document scaffolding ---------------------------------------------------

export const APP_VERSION = "1.80.8";
const MAGIC = "Hollywood Camera Work Shot Designer Scene";

/** Fields every canvas object carries, in the order the app writes them. */
export function baseFields(x = 0, y = 0) {
  return {
    uniqueID: newID(),
    x, y,
    colorIndex: 0,
    objectScaleX: 1,
    objectScaleY: 1,
    snapPath: "",
    snapAxis: "",
    snapAxisPointIndex: 0,
    snapAxisConstrainDistance: 0,
    snapAxisConstrainAngle: 0,
    snapAxisLineAngle: 0,
    snapPercent: 0,
    snapSection: 0,
    snapAbsolutePercent: 0,
    snapReverse: false,
    onPagesComma: "",
    scalable: true,
  };
}

const rotator = (tag, angle = 0, extra = {}) =>
  node(tag, {
    uniqueID: newID(), angle, angleOffset: 0,
    turnBackAgain: false, hideRotationStop: false, ...extra,
  });

const wrap = (tag, fields, subs) =>
  node(tag, fields, [
    node("SubObjects", {}, subs),
    node("ObjectEvents", {}),
  ]);

export const makeCharacter = (x, y, { color = 0xfc7b7b, colorName = "Red",
  colorIndex = 0, female = false, angle = 0 } = {}) =>
  wrap("Character",
    { ...baseFields(x, y), colorIndex, color, colorName, female },
    [rotator("RotatorCharacter", angle)]);

export const makeCamera = (x, y, angle = 0) =>
  wrap("Camera",
    { ...baseFields(x, y), cameraStyle: 1 },
    [rotator("RotatorCamera", angle, { tiltUp: false, tiltDown: false })]);

// Props ship with a wash applied; set pieces and lights carry their own colours.
const TINT_DEFAULTS = {
  GenericProp: { m: 0.7, r: 140, g: 145, b: 150 },
  GenericSet: { m: 1, r: 0, g: 0, b: 0 },
  GenericLight: { m: 1, r: 0, g: 0, b: 0 },
};

/** Props, lights and set pieces share one shape; only the tag differs. */
export const makeGeneric = (tag, x, y, objectKey, { scale = 1, angle = 0 } = {}) => {
  const t = TINT_DEFAULTS[tag] || TINT_DEFAULTS.GenericSet;
  return wrap(tag, {
    ...baseFields(x, y),
    objectScaleX: scale, objectScaleY: scale,
    objectKey,
    redMultiplier: t.m, greenMultiplier: t.m, blueMultiplier: t.m,
    redOffset: t.r, greenOffset: t.g, blueOffset: t.b,
    mirror: false,
    animatable: false,
  }, [
    node("Scaler", { uniqueID: newID() }),
    rotator(tag === "GenericLight" ? "RotatorObject" : "RotatorNoMenu", angle),
  ]);
};

/** Walls, tracks, axis lines, walk arrows and speed rails: a points list. */
export function makePath(tag, points, opts = {}) {
  const n = node(tag, {
    ...baseFields(0, 0),
    startArrowHead: opts.startArrowHead ?? false,
    endArrowHead: opts.endArrowHead ?? (tag === "WalkArrow"),
    fromConstraints: opts.from ?? "",
    toConstraints: opts.to ?? "",
    hardLine: opts.hardLine ?? (tag === "Wall"),
    closedLoop: opts.closedLoop ?? false,
    grid: opts.grid ?? (tag === "Wall"),
  });
  n.children.push(node("Points", {}, points.map((p) => node("Point", { x: p.x, y: p.y }))));
  n.children.push(node("SubObjects", {}));
  n.children.push(node("ObjectEvents", {}));
  return n;
}

/** A picture the user brought in, used as a prop or a background. */
export const makePicture = (dataURL) =>
  node("Picture", { uniqueID: newID(), base64Data: dataURL });

export const makeImageProp = (x, y, pictureID, scale = 1) =>
  wrap("ImageProp", {
    ...baseFields(x, y),
    objectScaleX: scale, objectScaleY: scale,
    pictureUniqueID: pictureID,
    mirror: false,
    animatable: false,
  }, [
    node("Scaler", { uniqueID: newID() }),
    rotator("RotatorObject", 0),
  ]);

export const makeStoryboard = (x, y, pictureID, caption = "") =>
  wrap("Storyboard", {
    ...baseFields(x, y),
    objectScaleX: 1, objectScaleY: 1,
    pictureUniqueID: pictureID,
    captionText: caption,
    blackFrame: true,
    animatable: false,
  }, [
    node("Scaler", { uniqueID: newID() }),
    rotator("RotatorObject", 0),
  ]);

export const makeCaption = (x, y, text) =>
  wrap("Caption", {
    ...baseFields(x, y),
    userText: text, systemText: "", headerText: "",
    fontSize: 0, textColor: 0, backgroundColor: 0, fontBold: false,
    attachObjectID: "", attachDistance: 0, attachDeltaX: 0, attachDeltaY: 0,
  }, []);

export const makeTimeNumber = (sequence) =>
  node("TimeNumber", {
    uniqueID: newID(), sequence,
    cameraSpeed: 3, actorSpeed: 3, sameSpeed: true,
  });

export function emptyScene() {
  const a = makeCharacter(-75, 0, { color: 0xfc7b7b, colorName: "Red", colorIndex: 0 });
  set(a, "uniqueID", "firstcharacter");
  const b = makeCharacter(75, 0, {
    color: 0x94b4ff, colorName: "Blue", colorIndex: 1, female: true, angle: -Math.PI,
  });
  set(b, "uniqueID", "secondcharacter");

  return node("ShotDesignerDocument", {}, [
    node("DocumentPreamble", { appVersion: APP_VERSION, magic: MAGIC, fileVersion: 1 }),
    node("CurrentSnapshot", {}, [
      node("Canvas", {}, [a, b]),
      node("TimeSlices", {}, [0, 1, 2].map(makeTimeNumber)),
      node("ShotList", {}, [node("ShotListItems", {})]),
    ]),
    node("LayerStates", {
      cameraLayer: true, trackLayer: true, lightingLayer: true,
      characterLayer: true, linesLayer: true, walkLayer: true,
      captionLayer: true, setLayer: true, propLayer: true,
      rigLayer: true, backgroundLayer: true, storyboardLayer: true,
      backgroundLayerTransparency: "1.0", disabledLayerTransparency: "0.2",
      shotDescriptionsTransparency: "1.0",
    }),
    node("SceneSettings", {
      showFieldShotNumber: true, showFieldNickname: true, showFieldLens: false,
      showFieldType: false, showFieldProps: false, showFieldCrew: false,
      showFieldEquipment: false,
      pageNames: Array(20).fill("Untitled").join("|"),
      modeSwitch: "", shotListExpanded: 0, demoScene: false,
      shotNumbering: 0, versionNumbering: 0, owners: "", randomString: "0".repeat(40),
    }),
    node("Pictures", {}),
    node("DocumentPostScript", { numObjects: 2, numSnapshot: 0 }),
  ]);
}

export function serialize(doc) {
  const canvas = child(child(doc, "CurrentSnapshot"), "Canvas");
  const post = child(doc, "DocumentPostScript");
  if (post && canvas) {
    set(post, "numObjects", canvas.children.length);
    set(post, "numSnapshot", kids(doc, "Snapshot").length);
  }
  // No trailing newline: the format doesn't have one, and with the app saving
  // itself every scene you merely opened would come back a byte different from
  // how it went in. A round trip should change nothing at all.
  return toXML(doc).replace(/\n$/, "");
}
