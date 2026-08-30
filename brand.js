/**
 * Everything the product calls itself, in one place. Renaming the app is a
 * one-line change here plus the repo and the hosted URL — nothing else in the
 * code should ever hard-code the name.
 */
export const BRAND = {
  name: "Shot Designer",          // ← the product name
  short: "Shot Designer",         // window titles, tight spaces
  tagline: "Overheads, blocking and shot lists",
  // The scenes folder on disk. This is a real path on the user's Mac and is
  // deliberately NOT tied to the product name.
  scenesFolder: "Shot Designer Scenes",
};

export const titleFor = (scene) =>
  `${scene || "Untitled Scene"} — ${BRAND.short}`;
