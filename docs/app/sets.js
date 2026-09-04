// Sets you can keep.
//
// A location gets shot for a week and turns up in thirty scenes. The way that
// works at the moment is: find another scene with the same room in it, save it
// under a new name, then delete the people, the cameras, the moves and the
// lights until only the room is left. That is a lot of deleting to get back to
// something you already drew, and every pass through it is a chance to leave
// a camera behind or take a wall with you.
//
// So a set is a thing you can save on its own: the room and what stands in it,
// with the action taken out. Start a scene from one, or drop one into a scene
// that already has another location in it.
//
// What counts as the set is decided by what it is not. Walls, doors, windows,
// stairs, furniture, dressing, vehicles and the floorplan photograph stay; the
// cast, the cameras, the rigs and track, the walk-throughs, the axis lines,
// the labels and the shot list go. Lighting and grip are the one genuinely
// arguable case — a standing lighting plot for a set is a real thing some
// people keep and others would be annoyed to inherit — so that is a choice
// rather than a rule, and it is off by default.

import * as H from "./hcw.js?v=4b38ac57";
import { LIGHTING, PRODUCTION, ANNOTATION } from "./catalog.js?v=4b38ac57";

const GRIP = new Set([...LIGHTING, ...PRODUCTION].map(([k]) => k));
const MARKUP = new Set(ANNOTATION.map(([k]) => k));

/** Tags that make up a place rather than what happens in it. */
const SET_TAGS = new Set(["Wall", "GenericSet", "GenericProp", "Background",
                          "ImageProp"]);

/**
 * Is this object part of the set?
 *
 * Decided against a list of what to drop rather than a list of what to keep,
 * because the second kind of list is always out of date: a scene from 2014 has
 * props in it whose keys are not in any menu this app shows, and they are
 * still the furniture in that room.
 */
export function inSet(o, { grip = false } = {}) {
  const key = H.get(o, "objectKey");
  if (o.tag === "GenericLight") return grip;
  if (!SET_TAGS.has(o.tag)) return false;
  if (MARKUP.has(key)) return false;                 // arrows are notes
  if (GRIP.has(key)) return grip;
  return true;
}

/** A short summary of what a set contains, for a list you have to choose from. */
export function summarise(objects) {
  const walls = objects.filter((o) => o.tag === "Wall").length;
  const kit = objects.filter((o) => o.tag !== "Wall"
    && o.tag !== "Background" && o.tag !== "ImageProp").length;
  const plan = objects.some((o) => o.tag === "Background");
  const bits = [];
  if (walls) bits.push(`${walls} ${walls === 1 ? "wall" : "walls"}`);
  if (kit) bits.push(`${kit} ${kit === 1 ? "piece" : "pieces"}`);
  if (plan) bits.push("floorplan");
  return bits.join(" · ") || "empty";
}

/**
 * Take the set out of a scene.
 *
 * Returns the objects as XML, along with only the pictures those objects
 * actually reference — a scene can be carrying several floorplans across its
 * pages and there is no reason for a saved set to haul the ones it does not
 * use, at a megabyte each.
 */
export function extract(doc, { grip = false } = {}) {
  const canvas = H.child(H.child(doc, "CurrentSnapshot"), "Canvas");
  const keep = canvas.children.filter((o) => inSet(o, { grip }));

  // A copy, so nothing here can reach back into the open scene.
  const copies = keep.map((o) => H.parseNode(H.toXML(o)));

  for (const o of copies) {
    // A move on a door is something that happened in that scene, not part of
    // the room. Same for which page a piece was put on: a set arrives on every
    // page of whatever it is dropped into, because that is what a set is.
    //
    // Cleared only where the field is already there. Writing one that was not
    // would add it to every scene this set is ever dropped into, and a format
    // another program has to read back is not the place to leave litter.
    for (const f of ["posMarks", "onPagesComma"]) {
      if (H.child(o, f)) H.set(o, f, "");
    }
  }

  const wanted = new Set(
    copies.map((o) => H.get(o, "pictureUniqueID")).filter(Boolean));
  const pictures = H.kids(H.child(doc, "Pictures"), "Picture")
    .filter((p) => wanted.has(H.get(p, "uniqueID")))
    .map((p) => H.parseNode(H.toXML(p)));

  return {
    objects: copies.map((o) => H.toXML(o)).join(""),
    pictures: pictures.map((p) => H.toXML(p)).join(""),
    summary: summarise(copies),
  };
}

/**
 * The objects and pictures of a saved set, with fresh IDs.
 *
 * Every ID in the fragment is renamed, and the rename is done on the text
 * before it is parsed. Objects point at each other in more ways than are worth
 * enumerating — a window remembers the wall it is snapped to, a picture prop
 * remembers its picture, a label remembers what it is attached to — and a
 * rename that misses one of those leaves a window floating in a room it is no
 * longer part of. Replacing the string everywhere it appears cannot miss.
 */
function rehydrate(set) {
  let objects = set.objects || "";
  let pictures = set.pictures || "";
  const ids = new Set();
  for (const m of (objects + pictures).matchAll(/<uniqueID>([^<]+)<\/uniqueID>/g)) {
    if (m[1]) ids.add(m[1]);
  }
  for (const old of ids) {
    const fresh = H.newID();
    const find = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    objects = objects.replace(find, fresh);
    pictures = pictures.replace(find, fresh);
  }
  return {
    objects: objects ? H.parseFragment(objects) : [],
    pictures: pictures ? H.parseFragment(pictures) : [],
  };
}

/** A new, empty scene with this set already standing in it. */
export function newScene(set) {
  const doc = H.emptyScene();
  place(doc, set);
  return doc;
}

/**
 * Put a set into a scene that already exists.
 *
 * Added rather than replacing: a scene that plays across a hallway and a
 * kitchen is two sets in one plan, and the second one arriving should not
 * take the first one away.
 */
export function place(doc, set) {
  let { objects, pictures } = rehydrate(set);
  const canvas = H.child(H.child(doc, "CurrentSnapshot"), "Canvas");
  const pics = H.child(doc, "Pictures");

  // A background is pinned at the origin and covers the whole plan, so two of
  // them is one photograph on top of another with no way to tell which is
  // which. The one already in the scene wins — you asked for this set to be
  // added to that plan, not for that plan to be papered over.
  let droppedPlan = false;
  if (canvas.children.some((o) => o.tag === "Background")) {
    const incoming = objects.filter((o) => o.tag === "Background");
    if (incoming.length) {
      droppedPlan = true;
      const orphaned = new Set(incoming.map((o) => H.get(o, "pictureUniqueID")));
      objects = objects.filter((o) => !incoming.includes(o));
      pictures = pictures.filter((p) => !orphaned.has(H.get(p, "uniqueID")));
    }
  }

  // Walls and the floorplan go in first so they sit under the furniture. The
  // draw order is by layer, but within a layer it is the order they are in,
  // and a rug over a sofa is somebody else's problem to undo.
  const first = objects.filter((o) => o.tag === "Background" || o.tag === "Wall");
  const rest = objects.filter((o) => !first.includes(o));
  canvas.children.unshift(...first);
  canvas.children.push(...rest);
  if (pics) pics.children.push(...pictures);
  return { count: objects.length, droppedPlan };
}
