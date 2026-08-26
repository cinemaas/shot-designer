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

// Character colours, in the order the app cycles them.
export const CHARACTER_COLORS = [
  ["Red", 0xfc7b7b], ["Blue", 0x94b4ff], ["Green", 0x8fd98f], ["Yellow", 0xffe680],
  ["Purple", 0xc9a3e6], ["Orange", 0xffbb77], ["Cyan", 0x8fdede], ["Pink", 0xffa8d3],
  ["Brown", 0xc4a484], ["Gray", 0xc0c0c0],
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
  ["propLayer", "Props"], ["storyboardLayer", "Storyboards"],
];

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
