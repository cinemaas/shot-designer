// A scene, handed to Blender.
//
// One way, on purpose. Sightline knows where the walls are, how high the lens
// is and what the lens is; Blender knows how to light and render. This writes
// what the first one knows in a form the second one can build, and stops
// there — nothing comes back, so there is no version of this where a render
// pass quietly rewrites your plan.
//
// What survives the trip: walls at their real length with their openings cut,
// props as blocks at their real footprint and height, people at their real
// stature and posture, and cameras with the actual sensor, focal length and
// squeeze — keyframed across the beats, so the move you built plays there too.
//
// What does not: artwork, materials beyond a flat colour, and anything about
// how it should look. That is the other half of the job and it belongs to
// whoever opens the file.

import * as H from "./hcw.js?v=4b38ac57";
import * as R from "./render.js?v=4b38ac57";
import * as V3 from "./view3d.js?v=4b38ac57";
import { UNITS_PER_FOOT } from "./catalog.js?v=4b38ac57";
import { projectedAspect } from "./optics.js?v=4b38ac57";

// Scene units are twentieths of a foot. Blender works in metres.
const M = (u) => +(u / UNITS_PER_FOOT * 0.3048).toFixed(4);
const rad = (r) => +r.toFixed(5);
const py = (v) => (typeof v === "string" ? JSON.stringify(v) : v);

/** Screen space has y going down; Blender's doesn't. Everything flips once. */
const flipY = (y) => -y;
const flipA = (a) => -a;

const colourOf = (obj, fallback = 0xbbbbbb) => {
  const n = (H.getNum(obj, "color", fallback) >>> 0) & 0xffffff;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * Wall segments, split around the openings in them, so a doorway is a hole
 * rather than a door-shaped decal on a solid wall. Same holes the 3D view
 * uses, so what Blender builds is what the viewfinder showed.
 */
function wallPieces(a, b, holes) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return [];
  const ux = dx / len, uy = dy / len;
  const top = V3.HEIGHTS.wall;

  // Where along this segment each opening sits, if it sits on it at all.
  const cuts = [];
  for (const h of holes) {
    const t = ((h.x - a.x) * ux + (h.y - a.y) * uy);
    const off = Math.abs((h.x - a.x) * -uy + (h.y - a.y) * ux);
    if (off > 14 || t < -h.half || t > len + h.half) continue;   // not on this wall
    cuts.push({ t0: Math.max(0, t - h.half), t1: Math.min(len, t + h.half),
                z0: h.z0, z1: h.z1 });
  }
  cuts.sort((p, q) => p.t0 - q.t0);

  const out = [];
  const piece = (t0, t1, z0, z1) => {
    if (t1 - t0 < 0.5 || z1 - z0 < 0.5) return;
    out.push({
      x: a.x + ux * (t0 + t1) / 2, y: a.y + uy * (t0 + t1) / 2,
      len: t1 - t0, z0, z1, angle: Math.atan2(dy, dx),
    });
  };

  let at = 0;
  for (const c of cuts) {
    piece(at, c.t0, 0, top);                 // full-height wall up to the opening
    piece(c.t0, c.t1, 0, c.z0);              // under the sill
    piece(c.t0, c.t1, c.z1, top);            // over the head
    at = Math.max(at, c.t1);
  }
  piece(at, len, 0, top);
  return out;
}

/** The openings in a scene, as the 3D view understands them. */
function holesIn(objects) {
  const holes = [];
  for (const o of objects) {
    if (!R.GENERIC_TAGS.has(o.tag)) continue;
    const key = H.get(o, "objectKey");
    const ap = V3.apertureOf(key);
    if (!ap || !V3.SEE_THROUGH.has(key)) continue;
    const b = R.artBounds(key);
    holes.push({
      x: H.getNum(o, "x"), y: H.getNum(o, "y"),
      half: (b.width * H.getNum(o, "objectScaleX", 1)) / 2,
      z0: ap[0] * UNITS_PER_FOOT, z1: ap[1] * UNITS_PER_FOOT,
    });
  }
  return holes;
}

/**
 * @param {object} opts
 *   name      scene name, used for the collection
 *   objects   the canvas children
 *   fmt       the camera format, already cut to its gate, plus `squeeze`
 *   lensOf    (cam) => focal length in mm
 *   heightOf  (cam) => lens height in feet, whatever it is standing on included
 *   beats     how many beats the scene runs
 *   sampleAt  (beat) => Map of id -> {x, y, a, h, tilt}, one per beat
 *   fps       frames per second
 *   beatFrames how many frames a beat lasts
 */
export function blenderScript(opts) {
  const { name, objects, fmt, lensOf, heightOf, beats = 1, sampleAt,
          fps = 24, beatFrames = 48 } = opts;
  const L = [];
  const w = (s) => L.push(s);

  w('# ' + "-".repeat(70));
  w(`# ${name} — built from a Sightline plan.`);
  w("#");
  w("# Open Blender, Scripting tab, Open, Run. Or: blender -P this-file.py");
  w("#");
  w("# Everything lands in its own collection, so nothing already in the file");
  w("# is touched. Walls, blocks where the furniture is, stand-ins where the");
  w("# people are, and the cameras with the real glass on them. Delete the");
  w("# collection to take it all back out again.");
  w('# ' + "-".repeat(70));
  w("");
  w("import bpy, math");
  w("from mathutils import Euler");
  w("");
  w(`COLLECTION = ${py(name)}`);
  w("");
  w("scene = bpy.context.scene");
  w("scene.unit_settings.system = 'METRIC'");
  w(`scene.render.fps = ${fps}`);
  w("");
  w("# A collection of our own. Re-running replaces it rather than piling up.");
  w("old = bpy.data.collections.get(COLLECTION)");
  w("if old:");
  w("    for ob in list(old.objects):");
  w("        bpy.data.objects.remove(ob, do_unlink=True)");
  w("    bpy.data.collections.remove(old)");
  w("group = bpy.data.collections.new(COLLECTION)");
  w("scene.collection.children.link(group)");
  w("");
  w("def mat(name, rgb):");
  w("    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)");
  w("    m.use_nodes = True");
  w("    bsdf = m.node_tree.nodes.get('Principled BSDF')");
  w("    if bsdf:");
  w("        bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1)");
  w("    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1)");
  w("    return m");
  w("");
  w("def box(name, loc, size, rot=0.0, rgb=(0.8, 0.8, 0.8)):");
  w("    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)");
  w("    ob = bpy.context.active_object");
  w("    ob.name = name");
  w("    ob.scale = size");
  w("    ob.rotation_euler = Euler((0, 0, rot), 'XYZ')");
  w("    ob.data.materials.append(mat(name.split('.')[0], rgb))");
  w("    for c in ob.users_collection: c.objects.unlink(ob)");
  w("    group.objects.link(ob)");
  w("    return ob");
  w("");
  w("def capsule(name, loc, radius, height, rgb):");
  w("    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height, location=loc)");
  w("    ob = bpy.context.active_object");
  w("    ob.name = name");
  w("    ob.data.materials.append(mat(name.split('.')[0], rgb))");
  w("    for c in ob.users_collection: c.objects.unlink(ob)");
  w("    group.objects.link(ob)");
  w("    return ob");
  w("");
  w("def ball(name, loc, radius, rgb):");
  w("    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc)");
  w("    ob = bpy.context.active_object");
  w("    ob.name = name");
  w("    bpy.ops.object.shade_smooth()");
  w("    ob.data.materials.append(mat(name.split('.')[0], rgb))");
  w("    for c in ob.users_collection: c.objects.unlink(ob)");
  w("    group.objects.link(ob)");
  w("    return ob");
  w("");

  // ---- the room ------------------------------------------------------------
  const holes = holesIn(objects);
  const walls = objects.filter((o) => o.tag === "Wall");
  let n = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  w("# --- walls " + "-".repeat(60));
  const THICK = M(8);                     // eight units — about five inches
  for (const wall of walls) {
    const pts = R.pointsOf(wall);
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    for (let i = 1; i < pts.length; i++) {
      for (const s of wallPieces(pts[i - 1], pts[i], holes)) {
        w(`box("Wall.${String(++n).padStart(3, "0")}", ` +
          `(${M(s.x)}, ${M(flipY(s.y))}, ${M((s.z0 + s.z1) / 2)}), ` +
          `(${M(s.len)}, ${THICK}, ${M(s.z1 - s.z0)}), ` +
          `${rad(flipA(s.angle))}, (0.82, 0.80, 0.76))`);
      }
    }
  }
  if (!n) w("# (no walls in this scene — trace them over the plan first)");

  // ---- the floor -----------------------------------------------------------
  if (Number.isFinite(minX)) {
    const pad = UNITS_PER_FOOT * 2;
    w("");
    w("# --- floor " + "-".repeat(60));
    w(`box("Floor", (${M((minX + maxX) / 2)}, ${M(flipY((minY + maxY) / 2))}, ${M(-2)}), ` +
      `(${M(maxX - minX + pad * 2)}, ${M(maxY - minY + pad * 2)}, ${M(4)}), ` +
      `0.0, (0.55, 0.54, 0.52))`);
  }

  // ---- furniture and set dressing -----------------------------------------
  w("");
  w("# --- set and props " + "-".repeat(52));
  let props = 0;
  for (const o of objects) {
    if (!R.GENERIC_TAGS.has(o.tag)) continue;
    const key = H.get(o, "objectKey");
    if (V3.SEE_THROUGH.has(key)) continue;         // it's a hole, not a thing
    const b = R.artBounds(key);
    const sx = H.getNum(o, "objectScaleX", 1), sy = H.getNum(o, "objectScaleY", 1);
    const hgt = V3.heightOf(o), base = V3.baseOf(o);
    const label = (key || "Prop").replace(/[^A-Za-z0-9]/g, "") || "Prop";
    w(`box("${label}.${String(++props).padStart(3, "0")}", ` +
      `(${M(H.getNum(o, "x"))}, ${M(flipY(H.getNum(o, "y")))}, ${M(base + hgt / 2)}), ` +
      `(${M(b.width * sx)}, ${M(b.height * sy)}, ${M(hgt)}), ` +
      `${rad(flipA(R.angleOf(o)))}, (0.62, 0.60, 0.58))`);
  }
  if (!props) w("# (nothing dressed into this scene)");

  // ---- people --------------------------------------------------------------
  w("");
  w("# --- people " + "-".repeat(59));
  const cast = objects.filter((o) => o.tag === "Character");
  for (const [i, o] of cast.entries()) {
    const pose = V3.postureOf(o);
    const lift = V3.elevationOf(o);
    // The stand-in is this person's own height, not an average one. Somebody
    // six foot four clearing a doorway is the kind of thing you build a proxy
    // to find out, so the proxy has to be them.
    const ownFt = H.getNum(o, "heightFt", 0) ||
                  (H.getBool(o, "female") ? 5.5 : 5.9);
    const scale = (ownFt * UNITS_PER_FOOT) / V3.STATURE.any;
    const rgb = colourOf(o, 0xfc7b7b);
    const who = (H.get(o, "userText") || H.get(o, "colorName") || `Person${i + 1}`)
      .replace(/[^A-Za-z0-9]/g, "") || `Person${i + 1}`;
    const x = M(H.getNum(o, "x")), y = M(flipY(H.getNum(o, "y")));
    const rgbs = `(${rgb.map((c) => c.toFixed(3)).join(", ")})`;

    if (pose.lying) {
      w(`p = box("${who}", (${x}, ${y}, ${M(lift + pose.top * scale / 2)}), ` +
        `(${M(pose.length * scale)}, ${M(pose.width)}, ${M(pose.top * scale)}), ` +
        `${rad(flipA(R.angleOf(o)))}, ${rgbs})`);
    } else {
      const headR = UNITS_PER_FOOT * 0.42 * scale;
      const bodyH = pose.top * scale - headR * 2;
      w(`p = capsule("${who}", (${x}, ${y}, ${M(lift + bodyH / 2)}), ` +
        `${M(UNITS_PER_FOOT * 0.62 * scale)}, ${M(bodyH)}, ${rgbs})`);
      w(`ball("${who}Head", (${x}, ${y}, ${M(lift + bodyH + headR)}), ` +
        `${M(headR)}, ${rgbs})`);
    }
  }
  if (!cast.length) w("# (nobody in this scene)");

  // ---- cameras -------------------------------------------------------------
  w("");
  w("# --- cameras " + "-".repeat(58));
  w("# Sensor and focal length are the real ones. An anamorphic lens is its");
  w("# marked focal vertically and that over the squeeze across, so the gate");
  w("# is widened by the squeeze and the render comes out unsqueezed — which");
  w("# is the picture you were looking at in the viewfinder.");
  w("");
  // `fmt` arrives already cut to its gate, the way the rest of the app
  // passes it around, so w and h are the area actually being recorded.
  const gate = { w: fmt.w, h: fmt.h };
  const squeeze = fmt.squeeze > 0 ? fmt.squeeze : 1;
  const aspect = projectedAspect(gate, squeeze);
  w(`scene.render.resolution_x = ${Math.round(1080 * aspect)}`);
  w("scene.render.resolution_y = 1080");
  w("scene.render.pixel_aspect_x = 1.0");
  w("scene.render.pixel_aspect_y = 1.0");
  w("");

  const cams = objects.filter((o) => o.tag === "Camera");
  const samples = [];
  if (sampleAt) for (let b = 0; b < beats; b++) samples.push(sampleAt(b));

  for (const [i, cam] of cams.entries()) {
    const label = `Cam${i + 1}`;
    const mm = Math.max(1, lensOf ? lensOf(cam) : 32);
    w(`d = bpy.data.cameras.new(${py(label)})`);
    w(`d.lens = ${mm.toFixed(2)}`);
    w("d.sensor_fit = 'HORIZONTAL'");
    w(`d.sensor_width = ${(gate.w * squeeze).toFixed(3)}`);
    w(`d.sensor_height = ${gate.h.toFixed(3)}`);
    w("d.clip_start = 0.05");
    w(`c = bpy.data.objects.new(${py(label)}, d)`);
    w("group.objects.link(c)");

    // Where it is at each beat. A camera that doesn't move gets one pose and
    // no keys; one that does gets a key on every beat, so scrubbing Blender's
    // timeline runs the move you built.
    const poses = [];
    for (let b = 0; b < Math.max(1, samples.length); b++) {
      const m = samples[b]?.get(H.get(cam, "uniqueID"));
      const x = m ? m.x : H.getNum(cam, "x");
      const y = m ? m.y : H.getNum(cam, "y");
      const a = m && Number.isFinite(m.a) ? m.a : R.angleOf(cam);
      // The same height the viewfinder shows: a camera's own if it has one,
      // else whatever it is standing on. A tripod and a hi-hat are not a
      // default apart, they are four feet apart.
      const hFt = m && m.h != null ? m.h
                : heightOf ? heightOf(cam) : V3.lensHeightFt(cam);
      const pitch = m && m.tilt != null ? m.tilt : V3.tiltOf(cam);
      poses.push({ x, y, a, z: hFt * UNITS_PER_FOOT, pitch });
    }
    const moves = poses.some((p) => Math.hypot(p.x - poses[0].x, p.y - poses[0].y) > 1 ||
                                    Math.abs(p.a - poses[0].a) > 1e-3 ||
                                    Math.abs(p.z - poses[0].z) > 1e-3);

    const place = (p) => {
      w(`c.location = (${M(p.x)}, ${M(flipY(p.y))}, ${M(p.z)})`);
      // A Blender camera with no rotation stares at the floor. Stand it up,
      // add the tilt, then turn it to face the way the plan says.
      w(`c.rotation_euler = Euler((${rad(Math.PI / 2 + p.pitch)}, 0, ` +
        `${rad(Math.atan2(-Math.cos(p.a), -Math.sin(p.a)))}), 'XYZ')`);
    };

    if (!moves) {
      place(poses[0]);
    } else {
      for (const [b, p] of poses.entries()) {
        const frame = 1 + b * beatFrames;
        place(p);
        w(`c.keyframe_insert("location", frame=${frame})`);
        w(`c.keyframe_insert("rotation_euler", frame=${frame})`);
      }
      w(`scene.frame_end = ${1 + (poses.length - 1) * beatFrames}`);
    }
    w("");
  }

  if (cams.length) {
    w("scene.camera = bpy.data.objects.get('Cam1')");
  } else {
    w("# (no cameras in this scene)");
  }

  w("");
  w("# A light, so the first render isn't black. Replace it with your own.");
  w("bpy.ops.object.light_add(type='AREA', location=(0, 0, " + M(V3.HEIGHTS.wall - 20) + "))");
  w("key = bpy.context.active_object");
  w("key.data.energy = 400");
  w("key.data.size = 4");
  w("for c in key.users_collection: c.objects.unlink(key)");
  w("group.objects.link(key)");
  w("");
  w(`print("Sightline: built " + COLLECTION)`);
  w("");
  return L.join("\n");
}
