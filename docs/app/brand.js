/**
 * Everything the product calls itself, in one place. Renaming the app is a
 * one-line change here plus the repo and the hosted URL — nothing else in the
 * code should ever hard-code the name.
 */
export const BRAND = {
  name: "Sightline",              // ← the product name
  short: "Sightline",             // window titles, tight spaces
  tagline: "Overheads, blocking and shot lists",
  // The scenes folder on disk. This is a real path on the user's Mac and is
  // deliberately NOT tied to the product name.
  scenesFolder: "Shot Designer Scenes",
};

/**
 * A short machine name for this product: the clipboard type, the cloud worker
 * and the salt the publisher hashes scene paths with all hang off it. Changing
 * it changes those, so change it once and change it early.
 */
export const SLUG = "sightline";

export const titleFor = (scene) =>
  `${scene || "Untitled Scene"} — ${BRAND.short}`;
