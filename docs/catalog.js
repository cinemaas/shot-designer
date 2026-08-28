// Object palette, transcribed from Shot Designer 1.80.8's own tables.
// `fxg` names index the converted vector art in assets.js.

export const PROPS = [
  ["SQUARETABLE", "Square Table", "SquareTable"],
  ["OVALTABLE", "Oval Table", "OvalTable"],
  ["ROUNDTABLE", "Round Table", "RoundTable"],
  ["CHAIR", "Chair", "Chair"],
  ["SOFA", "Sofa", "Sofa"],
  ["PAPER", "Paper", "Paper"],
  ["CELLPHONE", "Cell Phone", "CellPhone"],
  ["LAPTOP", "Laptop", "Laptop"],
  ["KEYBOARD", "Keyboard", "Keyboard"],
  ["MONITOR", "Monitor", "Monitor"],
  ["PLATE", "Plate", "Plate"],
  ["BOTTLE", "Bottle", "Bottle"],
  ["RIFLE", "Rifle", "Rifle"],
  ["BUSH", "Bush", "Bush"],
  ["TREE", "Tree", "Tree"],
  ["MINIBUS", "Mini Bus", "MiniBus"],
  ["SEMITRUCK", "Semi Truck", "SemiTruck"],
  ["TRUCKTRAILER", "Truck Trailer", "TruckTrailer"],
  ["MOTORCYCLE", "Motorcycle", "MotorCycle"],
  ["TANK", "Tank", "Tank"],
  ["SMALLPLANE", "Small Plane", "SmallPlane"],
  ["FIGHTERJET", "Fighter Jet", "FighterJet"],
  ["COMMERCIALJET", "Commercial Jet", "CommercialJet"],
  ["STRAIGHTARROW", "Straight Arrow", "StraightArrow"],
  ["CURVEDARROW", "Curved Arrow", "CurvedArrow"],
  ["CRANE", "Crane", "Crane"],
  ["BOOMMIC", "Boom Microphone", "BoomMicrophone"],
  ["MONITORVILLAGE", "Monitor Village", "MonitorVillage"],
  ["EQUIPMENT", "Equipment", "Equipment"],
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
  ["HOLLYWOODLIGHT", "Light On A Stick", "HollywoodLight"],
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
  ["CAR", "Car", "Car"],
  ["DOG", "Dog", "Dog"],
  ["HORSE", "Horse", "Horse"],
  ["GUN", "Gun", "Gun"],
  ["SUN", "Sun", "Sun"],
  ["GENERICMOVIELIGHT", "Generic Movie Light", "GenericMovieLight"],
  ["LED", "LED", "LED"],
];

export const KEY_TO_FXG = Object.fromEntries(
  [...PROPS, ...LIGHTING, ...SETPIECES, ...EXTRAS].map(([k, , f]) => [k, f])
);
export const KEY_TO_LABEL = Object.fromEntries(
  [...PROPS, ...LIGHTING, ...SETPIECES, ...EXTRAS].map(([k, l]) => [k, l])
);

// The app's own eight, read out of Josh's scene files rather than guessed, in
// the order colorIndex assigns them.
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
  ["propLayer", "Props"], ["backgroundLayer", "Background Images"],
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
