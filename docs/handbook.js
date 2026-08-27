// The handbook, built into the app so it's there when you need it on set.

export const HANDBOOK = [
  {
    id: "start",
    title: "Getting around",
    body: `
<p>The canvas is the set from above. One grid square is <b>two feet</b>, and
everything in the app is drawn to that — a person is two feet across, a 12×12
frame really is twelve feet.</p>
<dl>
<dt>Pan</dt><dd>Two-finger scroll, or hold <kbd>Space</kbd> and drag.</dd>
<dt>Zoom</dt><dd><kbd>⌘</kbd>-scroll, or <kbd>⌘+</kbd> / <kbd>⌘−</kbd>.</dd>
<dt>Fit the whole scene</dt><dd><kbd>⌘0</kbd>.</dd>
<dt>Select</dt><dd>Click. <kbd>⌘</kbd>-click or <kbd>⇧</kbd>-click adds and
removes. Drag across empty space to sweep up everything inside.</dd>
</dl>
<p>Clicking always goes for the thing you can see. Labels never steal a click
from whatever is underneath them, so the numbers you write on a position don't
get in the way of grabbing the person.</p>`,
  },
  {
    id: "moving",
    title: "Moving and shaping things",
    body: `
<p>Drag to move. Arrow keys nudge two units, <kbd>⇧</kbd> plus arrows moves
twenty. <kbd>[</kbd> and <kbd>]</kbd> rotate fifteen degrees at a time.</p>
<p>A selected prop gets a box in its own rotated frame with three handles: one
edge for <b>width</b>, one for <b>depth</b>, and the corner for <b>both</b>.
Hold <kbd>⇧</kbd> on the corner to keep its shape. So a table can be made long
and narrow without changing how deep it is. <b>Size…</b> on any prop takes exact
dimensions in feet.</p>
<p>Select several things and right-click for group work: align six ways,
distribute evenly, rotate or flip about the group's centre, spread apart or pull
together, recolour every selected character at once, or swap every selected prop
for a different one. The group gets its own box with a rotate handle and the
same stretch handles.</p>`,
  },
  {
    id: "walls",
    title: "Walls and building a set",
    body: `
<p>Press <kbd>W</kbd> or pick the wall tool. Click to start, click for each
corner, and the wall appears as you go — it's the real thing, not a preview.</p>
<dl>
<dt>Finish</dt><dd>Double-click, <kbd>⏎</kbd>, or click the last corner again.</dd>
<dt>Close a room</dt><dd>Click back on the corner you started from.</dd>
<dt>Take back a corner</dt><dd><kbd>⌫</kbd>.</dd>
<dt>Straight runs</dt><dd>Hold <kbd>⇧</kbd> to lock to fifteen degrees.</dd>
<dt>Off the grid</dt><dd>Hold <kbd>⌥</kbd>, or press <kbd>G</kbd> to turn grid
snap off entirely.</dd>
</dl>
<p>The bar along the bottom shows the length of the run in feet and its angle as
you draw. Corners snap to corners already in the scene, so rooms join up.</p>
<p>The wall tool stays armed because walls come in runs. Everything else is one
shot. <kbd>Esc</kbd> always leaves you with nothing armed.</p>`,
  },
  {
    id: "kit",
    title: "The kit",
    body: `
<p><b>Add ▸</b> has characters, cameras, props, furniture, set pieces, lighting,
grip, and camera support.</p>
<p><b>Grip</b> is the part the original never had: C-stands, combo stands,
sandbags, apple boxes, flags and floppies, 4×4 through 12×12 frames, overheads,
bounce, V-flats, mirror boards.</p>
<p><b>Lighting</b> covers the original's tungsten and fluorescent units plus
SkyPanel S30/S60/S120, LED tubes, 1.2K through 18K HMIs, space lights, ring
lights and book lights.</p>
<p><b>Camera support</b> has tripod, hi-hat, dolly, slider, jib and Steadicam.</p>
<p>For anything not covered, <b>Add Image Prop…</b> takes a PNG — transparent
works best — and it behaves like any other prop.</p>`,
  },
  {
    id: "shots",
    title: "Shots, fast",
    body: `
<p>Press <kbd>N</kbd>. The shot list opens with the cursor in the box, and you
type the shot the way you'd say it:</p>
<pre>ots d to m 50
cu sara 85
ins r 135
master</pre>
<p>It shows you what it understood before you commit. A size, then who, then the
lens as a bare number. Names match on the whole word or just the initial.
Everything the app knows — OTS, CU, MCU, ECU, M, MW, W, LONG, Two Shot, Master,
INS, POV, Profile, Push, Clean, Hi, Low, Jib, Slider, Drone — comes from what's
already written across this library.</p>
<p>Hitting <kbd>⏎</kbd> places the camera, points it, lenses it, gives it the
next letter and its own colour, and adds the row.</p>
<h4>Coverage without typing</h4>
<p>The <b>Cover</b> button lays out a two-hander in one go: the master, both
over-the-shoulders and both singles, with lenses at 32 / 50 / 50 / 85 / 85.
Singles are taken from past the other actor's shoulder, and every setup lands on
the same side of the line — if the scene already has cameras it works out which
side they're on and stays there.</p>
<h4>The list</h4>
<p>Rows reorder with the arrows, and the camera letters renumber to follow.
<b>⧉</b> duplicates a setup one step tighter — MCU becomes CU, CU becomes ECU —
which is usually what the second shot is. Double-click a row to rename it.
<b>Export CSV</b> gives the AD something they can open.</p>`,
  },
  {
    id: "blocking",
    title: "Blocking",
    body: `
<p>A busy scene ends up with one actor drawn at ten positions and arrows
crossing everywhere. Press <kbd>B</kbd>.</p>
<p>It works out the beats from what's already in the scene — the walk arrows
chain positions in order, and any numbers written into a position's label say
which beat it belongs to, including <code>1,4</code> for a spot that gets used
twice and <code>5/6</code> for two beats in the same place.</p>
<p>Step with <kbd>←</kbd> and <kbd>→</kbd>. Only the current beat is solid;
where everyone has already been ghosts behind them. Shot labels appear only for
cameras actually pointed at somebody live on that beat, which on a busy page
takes twenty-two labels down to about nine.</p>
<p>Nothing needs setting up first. It reads scenes you already made.</p>`,
  },
  {
    id: "clutter",
    title: "Keeping it readable",
    body: `
<p>Overheads turn into soup as the day goes on. The tools for that live under
the <b>Tidy</b> menu.</p>
<dl>
<dt>Colour Cameras Apart</dt><dd>Gives every camera its own colour. Their shot
chips and shot-list rows follow, so eight setups stop being eight identical
green arrows.</dd>
<dt>Shrink Shot Labels</dt><dd>Keeps the chips, drops the descriptions. Good for
a page you're handing to someone who just needs to see where the cameras are.</dd>
<dt>Spread Overlapping Labels</dt><dd>Overlapping labels are always nudged apart
on screen; this writes those nudges into the scene so they survive an export.</dd>
</dl>
<p><b>Layers</b> turns whole categories down — lighting, grip, walk arrows —
when you want the diagram to say one thing.</p>`,
  },
  {
    id: "files",
    title: "Files, and getting it to people",
    body: `
<p>This reads and writes the same <code>.hcw</code> files as Shot Designer,
straight out of your Shot Designer Scenes folder. Every save leaves a
timestamped copy of the previous version behind.</p>
<p><b>Don't have the same scene open in both apps.</b> The original has its own
sync and will write over what you did here.</p>
<dl>
<dt>Duplicate Scene…</dt><dd>Copies everything — set, lighting, cast, shot list
— so a second scene at the same location doesn't get built twice.</dd>
<dt>Export</dt><dd>PNG, SVG, a plain <code>.hcw</code>, or the shot list as CSV.
Exports are always on white paper whatever the screen is set to.</dd>
</dl>
<h4>Anywhere</h4>
<p>The same app is at <b>cinemaas.github.io/shot-designer</b> with the whole
library, encrypted — a passphrase unlocks it and is remembered on that device.
Editing there hands you the file back to drop in your folder.</p>
<h4>Live</h4>
<p>Connect to the cloud and everyone in a scene sees everyone else's cursor and
selection, with moves landing as they happen. <b>Get Share Link…</b> gives the
director a read-only URL that needs no app and no account.</p>`,
  },
  {
    id: "keys",
    title: "Every shortcut",
    body: `
<table>
<tr><td><kbd>N</kbd></td><td>New shot</td></tr>
<tr><td><kbd>B</kbd> then <kbd>←</kbd> <kbd>→</kbd></td><td>Blocking, step beats</td></tr>
<tr><td><kbd>W</kbd> / <kbd>T</kbd></td><td>Wall tool, camera track</td></tr>
<tr><td><kbd>G</kbd></td><td>Grid snap on and off</td></tr>
<tr><td><kbd>P</kbd></td><td>Play the timeline</td></tr>
<tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>Jump to a time slice</td></tr>
<tr><td><kbd>⌘</kbd>-click, <kbd>⇧</kbd>-click</td><td>Add to the selection</td></tr>
<tr><td><kbd>⌘C</kbd> <kbd>⌘X</kbd> <kbd>⌘V</kbd></td><td>Copy, cut, paste</td></tr>
<tr><td><kbd>⌘D</kbd></td><td>Duplicate</td></tr>
<tr><td><kbd>⌘A</kbd> / <kbd>Esc</kbd></td><td>Select all, deselect</td></tr>
<tr><td><kbd>⌘Z</kbd> <kbd>⇧⌘Z</kbd></td><td>Undo, redo</td></tr>
<tr><td><kbd>⌫</kbd></td><td>Delete</td></tr>
<tr><td>Arrows</td><td>Nudge two units, <kbd>⇧</kbd> for twenty</td></tr>
<tr><td><kbd>[</kbd> <kbd>]</kbd></td><td>Rotate fifteen degrees</td></tr>
<tr><td><kbd>⌘S</kbd> <kbd>⇧⌘S</kbd></td><td>Save, Save As</td></tr>
<tr><td><kbd>⌘O</kbd> <kbd>⌘N</kbd></td><td>Open, new scene</td></tr>
<tr><td><kbd>⌘E</kbd></td><td>Export PNG</td></tr>
<tr><td><kbd>⌘0</kbd> <kbd>⌘+</kbd> <kbd>⌘−</kbd></td><td>Fit, zoom in, zoom out</td></tr>
<tr><td><kbd>?</kbd></td><td>This handbook</td></tr>
</table>`,
  },
];
