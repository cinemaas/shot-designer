// Object palette, transcribed from the formats people actually shoot.
// `fxg` names index the converted vector art in assets.js.

// What "prop" means here is what it means on a set: something a person picks
// up. It is not a sofa. Everything that was filed under props because it was
// not a wall — the furniture, the vehicles, the trees, the grip — has moved to
// a heading that describes it, which is the difference between a menu you read
// and a menu you search.
export const PROPS = [
  ["CELLPHONE", "Cell Phone", "CellPhone"],
  ["PAPER", "Paper", "Paper"],
  ["LAPTOP", "Laptop", "Laptop"],
  ["PLATE", "Plate", "Plate"],
  ["BOTTLE", "Bottle", "Bottle"],
  ["RIFLE", "Rifle", "Rifle"],
  ["KEYBOARD", "Keyboard", "Keyboard"],
];

/**
 * Things a person holds, with the size they actually are.
 *
 * `along` says the thing lies down the line of the hand rather than sitting in
 * the palm — a rifle and a torch point where the arm points, a mug does not.
 * `out` is how far past the wrist it sits, in hand-lengths.
 */
export const HAND_PROPS = {
  "":       { label: "Nothing" },
  CELLPHONE:{ label: "Phone", w: 0.24, d: 0.09, h: 0.50, out: 0.55 },
  MUG:      { label: "Mug", w: 0.34, d: 0.34, h: 0.42, out: 0.55 },
  GLASS:    { label: "Glass", w: 0.26, d: 0.26, h: 0.50, out: 0.55 },
  BOTTLE:   { label: "Bottle", w: 0.28, d: 0.28, h: 0.95, out: 0.55 },
  PAPER:    { label: "Papers", w: 0.70, d: 0.04, h: 0.92, out: 0.5 },
  BOOK:     { label: "Book", w: 0.58, d: 0.14, h: 0.80, out: 0.5 },
  LAPTOP:   { label: "Laptop", w: 1.10, d: 0.80, h: 0.14, out: 0.6 },
  CAMERA:   { label: "Stills Camera", w: 0.50, d: 0.40, h: 0.34, out: 0.55 },
  BAG:      { label: "Bag", w: 0.85, d: 0.45, h: 1.15, out: 0.75 },
  CLIPBOARD:{ label: "Clipboard", w: 0.75, d: 0.06, h: 1.00, out: 0.5 },
  RADIO:    { label: "Radio", w: 0.20, d: 0.14, h: 0.55, out: 0.5 },
  GUN:      { label: "Handgun", w: 0.85, d: 0.16, h: 0.42, out: 0.35, along: true },
  RIFLE:    { label: "Rifle", w: 3.20, d: 0.18, h: 0.38, out: 0.9, along: true },
  TORCH:    { label: "Torch", w: 0.85, d: 0.18, h: 0.18, out: 0.45, along: true },
  UMBRELLA: { label: "Umbrella", w: 0.16, d: 0.16, h: 2.60, out: 0.4 },
  BOOMPOLE: { label: "Boom Pole", w: 6.00, d: 0.10, h: 0.10, out: 1.2, along: true },
};

/** Which of them want a hand up in front of you to be any use. */
export const LOOKED_AT = new Set(
  ["CELLPHONE", "LAPTOP", "PAPER", "BOOK", "CAMERA", "MUG", "GLASS",
   "CLIPBOARD", "RADIO"]);

/**
 * And which are long enough that hanging them off a straight arm points them
 * at the floor. These get carried across the body instead, which is both what
 * people do and the only way a rifle reads as a rifle rather than as a stick.
 */
export const CARRIED = new Set(["RIFLE", "BOOMPOLE", "UMBRELLA", "TORCH"]);

export const FURNITURE = [
  ["SQUARETABLE", "Square Table", "SquareTable"],
  ["OVALTABLE", "Oval Table", "OvalTable"],
  ["ROUNDTABLE", "Round Table", "RoundTable"],
  ["CHAIR", "Chair", "Chair"],
  ["SOFA", "Sofa", "Sofa"],
  ["MONITOR", "Monitor", "Monitor"],
];

export const VEHICLES = [
  ["MINIBUS", "Mini Bus", "MiniBus"],
  ["SEMITRUCK", "Semi Truck", "SemiTruck"],
  ["TRUCKTRAILER", "Truck Trailer", "TruckTrailer"],
  ["MOTORCYCLE", "Motorcycle", "MotorCycle"],
  ["TANK", "Tank", "Tank"],
  ["SMALLPLANE", "Small Plane", "SmallPlane"],
  ["FIGHTERJET", "Fighter Jet", "FighterJet"],
  ["COMMERCIALJET", "Commercial Jet", "CommercialJet"],
  ["CAR", "Car", "Car"],
  ["CARINTERIOR", "Car Interior", "CarInterior"],
];

export const NATURE = [
  ["BUSH", "Bush", "Bush"],
  ["TREE", "Tree", "Tree"],
  ["DOG", "Dog", "Dog"],
  ["HORSE", "Horse", "Horse"],
  ["SUN", "Sun", "Sun"],
];

export const PRODUCTION = [
  ["CRANE", "Crane", "Crane"],
  ["BOOMMIC", "Boom Microphone", "BoomMicrophone"],
  ["MONITORVILLAGE", "Monitor Village", "MonitorVillage"],
  ["EQUIPMENT", "Equipment", "Equipment"],
];

export const ANNOTATION = [
  ["STRAIGHTARROW", "Straight Arrow", "StraightArrow"],
  ["CURVEDARROW", "Curved Arrow", "CurvedArrow"],
];

export const LIGHTING = [
  ["FRESNELSMALL", "Small Fresnel", "FresnelSmall"],
  ["FRESNELMEDIUM", "Medium Fresnel", "FresnelMedium"],
  ["FRESNELLARGE", "Large Fresnel", "FresnelLarge"],
  ["FLO4", "FLO 4 Tubes", "Flo4"],
  ["FLO2", "FLO 2 Tubes", "Flo2"],
  ["SINGLEFLOTUBE", "Single FLO Tube", "SingleFloTube"],
  ["LIGHTPANEL", "Light Panel", "LightPanel"],
  ["LED1x1PANEL", "LED 1x1 Panel", "LEDPanel1x1"],
  ["OPENFACE", "Open Face", "OpenFace"],
  ["ELLIPSOIDAL", "Ellipsoidal", "Ellipsoidal"],
  ["PARLIGHT", "PAR Light", "PAR"],
  ["SCOOP", "Scoop", "Scoop"],
  ["CYCLIGHT", "Cyc Light", "CycLight"],
  ["SOFTBOX", "Soft Box", "SoftBox"],
  ["PRACTICALLIGHT", "Practical Light", "Practical"],
  ["HOLLYWOODLIGHT", "Light On A Stick", "StickLight"],
  ["BALLOONLIGHT", "Balloon Light", "BalloonLight"],
  ["CHINABALL", "China Ball", "ChinaBall"],
  ["BOUNCEBOARD", "Bounce Board", "BounceBoard"],
  ["SILK", "Silk", "Silk"],
];

export const SETPIECES = [
  ["SMALLWINDOW", "Window", "Window"],
  ["DOOROPEN", "Open Door", "DoorOpen"],
  ["DOORCLOSED", "Closed Door", "DoorClosed"],
  ["DOUBLEDOOROPEN", "Double Open Door", "DoubleDoorOpen"],
  ["DOUBLEDOORCLOSED", "Double Closed Door", "DoubleDoorClosed"],
  ["SMALLOPENING", "Small Opening", "SmallOpening"],
  ["MEDIUMOPENING", "Medium Opening", "MediumOpening"],
  ["BIGOPENING", "Big Opening", "BigOpening"],
  ["PRISONBARS", "Prison Bars", "PrisonBars"],
  ["STAIRSSHORT", "Stairs", "StairsShort"],
];

// Vector art shipped with the app but absent from its 1.80.8 palette.
export const EXTRAS = [
  ["GUN", "Gun", "Gun"],
  ["GENERICMOVIELIGHT", "Generic Movie Light", "GenericMovieLight"],
  ["LED", "LED", "LED"],
];

/** Everything with artwork, whatever heading it now sits under. */
export const ALL_KIT = [...PROPS, ...FURNITURE, ...VEHICLES, ...NATURE,
                        ...PRODUCTION, ...ANNOTATION, ...LIGHTING, ...SETPIECES,
                        ...EXTRAS];

export const KEY_TO_FXG = Object.fromEntries(ALL_KIT.map(([k, , f]) => [k, f]));
export const KEY_TO_LABEL = Object.fromEntries(ALL_KIT.map(([k, l]) => [k, l]));

// The app's own eight, read out of Josh's scene files rather than guessed, in
// the order colorIndex assigns them.
// ---------------------------------------------------------------- people
//
// How somebody looks, which is a different question from which character they
// are. The colour in CHARACTER_COLORS says *who*; these say what they look
// like, and the two never touch — that separation is the whole reason a green
// character does not have a green face.

/**
 * Skin, light through dark. Eight steps rather than a continuum, because a
 * swatch you can point at beats a slider you have to hunt along, and because
 * these want to be stable values a scene can be saved with.
 *
 * Chosen to sit evenly across the range rather than clustering at the pale end,
 * which is the usual failure of a set like this.
 */
export const SKIN_TONES = [
  ["Porcelain", "#f6ded0"], ["Fair", "#f0cdb4"], ["Light", "#e5b393"],
  ["Olive", "#cf9a72"], ["Tan", "#b87c53"], ["Bronze", "#9d6844"],
  ["Deep", "#7d5136"], ["Ebony", "#5d3a26"],
];

export const HAIR_COLOURS = [
  ["Black", "#1f1a1a"], ["Dark Brown", "#3a2a20"], ["Brown", "#5a3d28"],
  ["Light Brown", "#7d5836"], ["Blonde", "#c39a5c"], ["Auburn", "#7a3520"],
  ["Red", "#9c4a24"], ["Grey", "#8e8b88"], ["White", "#d8d5d1"],
];

export const HAIR_STYLES = [
  ["short", "Short"], ["ponytail", "Ponytail"], ["medium", "Medium"],
  ["long", "Long"], ["bun", "Bun"],
  // Hair that grows in a coil is a different shape, not a darker version of
  // the same one, and a cast you can only build out of one kind of hair is a
  // cast that leaves people out. These are silhouettes in their own right.
  ["afro", "Afro"], ["coils", "Short Coils"], ["braids", "Braids"],
  ["locs", "Locs"], ["cornrows", "Cornrows"],
  ["bald", "Bald"],
];

export const BUILDS = [["slight", "Slight"], ["average", "Average"],
                       ["heavy", "Heavy"]];

export const CHARACTER_COLORS = [
  ["Red", 0xfc837b], ["Blue", 0x94b8ff], ["Green", 0x76fa8a], ["Cyan", 0x7cffe0],
  ["Pink", 0xe69bf0], ["Yellow", 0xffff86], ["Gray", 0xbbbbbb], ["Extra", 0xffffff],
];

// Cameras are all one green in the original, which stops being useful the
// moment a scene has eight of them. colorIndex is already in the file format
// and the original preserves it, so tinting a camera costs nothing on a
// round-trip. Index 0 stays the green everyone recognises.
export const CAMERA_COLORS = [
  ["Green", 0x09d901], ["Orange", 0xff8c1a], ["Magenta", 0xe839c5],
  ["Cyan", 0x14c8e6], ["Yellow", 0xf5d800], ["Violet", 0x9b6cff],
  ["Red", 0xf03c3c], ["Blue", 0x2f7dfa],
];

export const SHOT_SIZES = [
  "Not Set", "Extreme Close-Up", "Big Close-Up", "Close-Up", "Medium Close-Up",
  "Medium Shot", "Medium Long Shot", "Long Shot", "Extreme Long Shot",
  "Single Shot", "Two Shot", "Three Shot", "Group Shot", "Over The Shoulder",
];

export const SHOT_FUNCTIONS = [
  "Right-Angle Master", "Insert", "Point Of View", "Reaction Shot",
  "Establishing Shot", "Master Push", "Close Push", "Slow Creep", "Pan Search",
  "Low Angle", "Bird's Eye View", "Straight Down", "Straight Up", "Deep Staging",
];

export const LAYERS = [
  ["cameraLayer", "Cameras"], ["trackLayer", "Tracks"],
  ["lightingLayer", "Lighting"], ["characterLayer", "Characters"],
  ["linesLayer", "Axis Lines"], ["walkLayer", "Walk Arrows"],
  ["captionLayer", "Captions"], ["setLayer", "Set"],
  ["propLayer", "Props"], ["rigLayer", "Camera Support"],
  ["backgroundLayer", "Background Images"],
  ["storyboardLayer", "Storyboards"],
];

// The things you build once and then work on top of. Locking these is the
// common case: you want to see the room, not drag it by accident.
export const SCENERY_LAYERS = ["setLayer", "propLayer", "backgroundLayer"];

// --- scale -------------------------------------------------------------------
// The original app has no notion of real-world units, but its wall grid is
// rigidly 40 scene units (every grid-snapped wall coordinate in a 376-scene
// library is a multiple of 40), and a character circle is exactly one square.
// A person's footprint is about two feet, which fixes the rest.
export const GRID = 40;              // scene units per grid square
export const UNITS_PER_FOOT = 20;    // so one square reads as 2 ft

/** Feet and inches, the way an AD would say it. */
export function feet(units, unitsPerFoot = UNITS_PER_FOOT) {
  const total = Math.abs(units) / unitsPerFoot;
  let ft = Math.floor(total);
  let inch = Math.round((total - ft) * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return inch ? `${ft}'${inch}"` : `${ft}'`;
}
