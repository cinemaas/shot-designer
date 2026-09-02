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
<p>People are a head on a pair of shoulders, seen from above. The head carries
the original's own marks — one line for a man, two for a woman — so the thing
you already read at a glance is unchanged; it's just the size a head is, sitting
in front of a shoulder bar. A ball in front of a wider bar reads as a person
however small the page gets, and takes up far less room than a two-foot circle,
which is what stops a crowded plan turning to soup.</p>
<p><b>☰ ▸ Appearance…</b> has two alternatives: solid head and shoulders, or the
original circles.</p>
<p>Clicking always goes for the thing you can see. Labels never steal a click
from whatever is underneath them, so the numbers you write on a position don't
get in the way of grabbing the person.</p>`,
  },
  {
    id: "pages",
    title: "Pages",
    body: `
<p>A scene can hold several plans of the same set — blocking on one page,
lighting on another, a camera plan on a third. It's how a busy location stays
readable without splitting into separate files, and it's the original's own
feature: objects carry the pages they belong on.</p>
<p>The <b>page button</b> at the bottom right shows where you are — <code>1/5</code>
— and opens the list. Pages can be named. <b>All pages at once</b> shows
everything stacked, which is occasionally what you want and usually isn't.</p>
<dl>
<dt>Put something on a page</dt><dd>Select it, then <b>Put Selection On Page N</b>
from the page menu.</dd>
<dt>Something that belongs everywhere</dt><dd><b>Put Selection On Every Page</b> —
the set, the walls, the furniture. That's the default for anything new.</dd>
</dl>
<p>Scenes you already made come in with their pages intact; the app reads the
assignments that are already in the file.</p>`,
  },
  {
    id: "moving",
    title: "Moving and shaping things",
    body: `
<p>Drag to move. Arrow keys nudge two units, <kbd>⇧</kbd> plus arrows moves
twenty. <kbd>[</kbd> and <kbd>]</kbd> rotate fifteen degrees at a time.</p>
<h4>Walking somebody through a scene</h4>
<p><b>Walk To…</b> on a person, then <b>click wherever they go next</b>. Each
click drops another of them there, turned the way they travelled, joined to the
one before by an arrow and numbered — position 1, 2, 3. Keep clicking for as
long as the move goes on; <kbd>⏎</kbd> stops, and so does clicking on a
position that's already there — nobody wants two of somebody standing in the
same spot, so reaching back for the one you just placed picks it up to drag
instead of dropping another on top of it.</p>
<p>That's how the scenes in this library are built: one actor as ten positions
in a chain, which is why the whole move reads off a single sheet.</p>
<p>On the page every position shows at once, numbered. The moment you step off
the first beat it becomes <b>one person walking</b>: the figure travels the
route and the positions it is standing in for ghost back, so you see a move
rather than a crowd. Land on a whole beat and it's that position itself
showing, with its own number.</p>
<h4>Moving a camera</h4>
<p><b>Move To…</b> on a camera, then <b>click where it goes next</b> — exactly
the way Walk To works for people. Position 1 stays where it is; each click
drops another camera there, numbered, joined by a dashed line in that camera's
colour. Keep clicking for as many positions as the move has; <kbd>⏎</kbd>
stops.</p>
<p>Every one of them is a real camera. Grab it, drag it, swing it, change its
height and tilt — change your mind as often as you like. Playing the move runs
between them and carries <b>everything</b>: it travels, swings, rises and tilts
from one position to the next.</p>
<p>On the timeline the positions stop being separate cameras and become one
camera making one move, so it doesn't matter which of them you have selected —
press play from position 3 and you watch the whole move, through the lens, from
wherever the camera has got to. Park on a beat and the sliders drive
<i>that</i> position, so you can land on position 2 and finesse it.</p>
<h4>The other way — positions on one camera</h4>
<p>You don't have to plan a move before you place the camera. Put the camera
where it starts, then <b>Add a Move…</b> — or <kbd>M</kbd>. That pins where it
stands as <b>position 1</b>, adds a second slice and drops you on it. Now just
<b>drag the camera where it ends up</b>: that becomes position 2.</p>
<p>A camera move is a move in three dimensions: each position holds the
<b>lens height</b> and the <b>tilt</b> as well as where it stands and which way
it points. <b>Height &amp; Tilt…</b> takes both as numbers. Set a jib low and
level at position 1, high and tilted down at position 2, and it rises and
tilts through the move — the plan writes the height and the tilt under any
position where they change, and the through-the-lens view follows them.</p>
<p>While you are parked on a beat the camera really is at that position, so
panning it, tilting it and dragging it all behave exactly as they do on a
camera with no move at all — and whatever you do is recorded to that position.
There is nothing to press: adjust it at any beat and that beat keeps it.</p>
<h4>Flying the camera from the lens view</h4>
<p>The through-the-lens panel has three sliders: <b>Height</b>, <b>Tilt</b> and
<b>Pan</b>. They move the real camera, so the overhead turns and the frame
updates as you drag — find the shot by looking at it rather than guessing
numbers on the plan. On a camera with a move, whatever you land on is kept as
that position.</p>
<h4>Swivelling</h4>
<p>Three ways, so you never have to hunt: the handle on the end of the
direction line, <kbd>⇧</kbd>-drag anywhere on the camera, or <kbd>[</kbd> and
<kbd>]</kbd> for fifteen degrees a press — <kbd>⇧</kbd> with those for one
degree.</p>
<h4>It saves itself</h4>
<p>A scene that has a name on disk writes itself a couple of seconds after you
stop working. Undo still goes back as far as it ever did. Because it is writing
your real scene file, don't have the same scene open in another app at the
same time.</p>
<p>From then on, dragging that camera while parked on a slice re-pins <i>that</i>
position, so you can keep adjusting either end without starting over.
<b>Add Position 3…</b> extends the move, <kbd>M</kbd> pins the current slice, and
<b>Clear Move</b> puts it back to a camera that just sits there.</p>
<p>The move draws on the plan as a dashed run with a numbered dot at each
position, in that camera's own colour, so the whole thing reads without pressing
anything. <kbd>P</kbd> plays it, and the camera travels and turns between the
marks rather than jumping. People work the same way.</p>
<h4>Your camera package</h4>
<p><b>Camera Package…</b> sets what the whole app measures against. Pick the
<b>lenses</b> you have, in the order you reach for them — they become the chips
in the shot list. Pick the <b>camera body</b> from the sensor sizes, then the
<b>recording gate</b>: full sensor, 16:9, 17:9, 2.39, 4:3, and the rest. Then
the <b>glass</b> — spherical, or 1.3x, 1.5x, 1.8x, 2x anamorphic.</p>
<p>It tells you what that combination gives you as you set it, because on
anamorphic the numbers on a sensor and the shape of the picture are two
different things. A 4:3 gate on an Alexa through a 2x is 17.8×13.4mm of sensor
and a 2.67:1 picture, and a 50mm covers 39 degrees across it rather than the 27
it would cover spherical. The lens cones on the plan and the through-the-lens
view both follow it.</p>
<h4>Two ways to draw a light</h4>
<p><b>Lights: Diagram Style</b> in the menu draws every fixture as a small
symbol with its name beside it and the throw it covers, the way a lighting plan
does — rather than its own artwork at the size the file measures it by. It
changes nothing on disk: a scene drawn either way is the same scene, so you can
work in one and hand over the other.</p>
<h4>The timeline</h4>
<p>Positions used to be a running order — 1, then 2, then 3, everybody in step.
A scene isn't like that. Open the <b>timeline</b> from the toolbar and every
move gets a bar on its own lane: <b>drag a bar</b> to make that move happen
later, <b>pull its right edge</b> to make it take longer, and <b>line two bars
up</b> to make them happen together. One person can cross while another waits;
a camera can start its move halfway through somebody's walk. Click an empty
part of a lane to scrub.</p>
<p>The positions are the keyframes — 1, 2, 3, the same numbers as on the plan.
Each is a bar on its lane. <b>Drag the bar</b> to move that beat, <b>pull
either end</b> to stretch it, and the <b>gap between two bars is a hold</b>:
somebody has arrived and is waiting. Holds draw as a hatched span with their
length on them, so the waiting is as visible as the walking.</p>
<p>Beats land on quarters as you drag; hold <kbd>⌥</kbd> for anything in
between. If dragging isn't precise enough, <b>click a bar</b> and type the
numbers.</p>
<p>Nothing has to be set: a position numbered 2 starts at beat 1 and takes one
beat unless you say otherwise, which is what everything did before.</p>
<h4>Turning on the spot</h4>
<p><b>Turn To…</b> gives somebody a position where they are, so all you do is
swing it. A turn is a beat like any other — somebody facing the door is a move,
it just doesn't go anywhere — and it draws as an arc round them from where they
were looking to where they end up.</p>
<h4>Stills for every beat</h4>
<p><b>Stills For Every Beat…</b> in the menu walks the whole scene and writes a
picture of each beat: the overhead, and what every camera sees. They land in
<code>Stills/&lt;scene&gt;/</code> next to your scenes, so you end up with a
folder to hand somebody rather than screenshots.</p>
<h4>Bending a move</h4>
<p>Select a walk arrow, a track, or a camera with a move on it and you get a
<b>hollow handle in the middle of each run</b>. Drag one and it becomes a real
control point, so a straight move bends into whatever shape you want. Every
bend you add gives you two more handles, so you can keep going. Drag the solid
points to reshape it, <kbd>⌥</kbd>-click one to take it out, and
<kbd>⌥</kbd>-click the last one to go straight again.</p>
<p>The travel follows the line you drew, not the corners — scrub the timeline
and the figure or camera is on the curve where you can see it.</p>
<p>Dragging the end of a walk arrow <b>walks the person on it</b> rather than
leaving the arrow pointing at nobody — either end, coming or going. The arrow
keeps its clearance from them as they go.</p>
<h4>Doors and windows go on walls</h4>
<p>Drop a door, a window or an opening near a wall and it takes that wall's
line and its angle — it sits <i>in</i> the wall rather than beside it. That
isn't tidiness: an opening has to be in the wall to be cut out of it, and an
opening that isn't cut out is one you can't see through when you look down the
lens. Drag one and it re-seats on whatever wall it lands near, and moving a
wall brings everything on it along. Hold <kbd>⌥</kbd> while dragging to place
one exactly where you want instead. Furniture and props are left alone.</p>
<h4>Making a still of the frame</h4>
<p><b>Make Still</b> in the viewfinder sends the frame up as a reference picture
and brings a photoreal one back, which lands on the plan as a storyboard card
beside its camera. The frame goes as a <i>picture</i>, not as a description of
one — the geometry is already right, and asking a model to rebuild it from prose
is how you get a handsome still of a different room.</p>
<p>It needs an OpenAI key, set once in <b>Image Generation…</b>. The key stays on
this machine: the page never sees it, and it cannot reach a share link or a
published library. Without one you are offered the other route — the frame saved
and the brief copied, ready to paste wherever you like.</p>
<h4>Cars</h4>
<p>The car is a Ford Explorer, built to the published figures: 16ft 6.8 long,
6ft 6.9 across the body, 7ft 5.3 over the mirrors, 5ft 9.9 to the roof, on a 9ft
11 wheelbase and 30in wheels. A specific car rather than a generic one, because
a specific one has numbers you can check — and because it is what turns up as a
picture car more than anything else its size.</p>
<p>The symbol inherited from the old format was twenty-three feet eight. The symbol inherited from
the old format was twenty-three feet eight — a stretch limousine — and twenty of
the cars in this library had been scaled down by hand to correct it, most to
between fifteen and seventeen feet. It is drawn at its real size now, and those
hand-sized ones were rescaled so they kept the size somebody gave them.</p>
<p>Down the lens it is two masses lofted from real sections: a body from the
sill to the beltline with the wheels standing in open arches, and a cabin above
it, upright, glazed between opaque pillars under a metal roof. A and B and C and
D pillars are drawn because they are what a camera has to shoot around.</p>
<h4>People in a car</h4>
<p><b>Seat Someone…</b> on a car puts them in one of the four seats: driver,
front passenger, or either side in the back. Somebody already selected gets
moved in; otherwise a new person is cast into the seat.</p>
<p>It is three things at once — the seat's place on the floor, sitting rather
than standing, and a foot of height so they are on the seat and not under it —
and getting two of the three right is how somebody ends up kneeling in a
footwell. <b>Empty The Car</b> puts everybody back on their feet.</p>
<h4>Who somebody is, and what they look like</h4>
<p>These are two different settings and they never touch. Select somebody and
the character panel opens on the left.</p>
<dl>
<dt>Character colour</dt><dd>Which character this is. It lands on their top and
on their mark on the plan, so you can pick the red one out of a room at a
glance. It is not their skin — a green character does not have a green face.</dd>
<dt>Skin</dt><dd>Eight tones. Face, ears, neck and hands, and nothing else.</dd>
<dt>Name</dt><dd>Type it at the top of the panel. It labels them on the plan,
names them in the brief, and joins the cast list so you can drop them into
another scene.</dd>
<dt>Hair</dt><dd>Colour and style, on their own again. Eleven cuts: short,
medium, long, ponytail and bun, plus afro, short coils, braids, locs and
cornrows — hair that grows in a coil is a different shape, not a darker version
of one that hangs, so they are built as different shapes.</dd>
<dt>Build</dt><dd>Presentation, build and real height. Change the height and the
proportions change with it rather than the whole person being scaled — a tall
person is longer in the leg, not bigger all over.</dd>
<dt>Pose and facing</dt><dd>Body facing and head facing are separate numbers,
because somebody standing one way and looking another is often the whole point
of the shot.</dd>
</dl>
<p>Everything applies as you touch it. Nothing here moves anybody, turns them,
or resets what they were doing.</p>
<h4>What's in their hands</h4>
<p><b>Holding</b> in the character panel, or <b>Holding…</b> on the right-click
menu, and then which hand — left, right, or both.</p>
<p>The thing is drawn in that hand's own frame, so it turns with the hand
rather than floating near a wrist: a rifle points where the arm points, a mug
stays upright in the palm. Something you look at puts a hand up in front of
you; something long gets carried across the body, because hanging a rifle off a
straight arm points it at the floor.</p>
<h4>Arms, and what's in their hands</h4>
<p>Right-click a person for <b>Arms</b>: at their sides, held out, out in
front, folded, raised, or hands in pockets. The arms actually go there, and so
do the hands — which is the point, because <b>Holding…</b> puts something in
one of them: a phone, a bottle, papers, a laptop, a gun, a torch, a bag, a mug,
a book, a stills camera.</p>
<p>A prop rides whatever the arms are doing, so a phone at somebody's side and
a phone out in front of them are two different frames. Picking something to
look at puts the arms in front for you unless you've already set them. The plan
marks who is carrying something, and the brief says what.</p>
<h4>Standing on something</h4>
<p>A plan is flat, so the only way to say somebody is on a bed, on a step or on
an apple box is to say it. <b>Height Off The Floor…</b> on a person does that,
in feet — a bed is about 2, a step 8 inches, an apple box 1. The lens cares:
eighteen inches of bed is the difference between an eyeline and the top of a
head. Stairs draw as real treads and risers, so you can see which one somebody
is on.</p>
<h4>Keeping an eye on a frame</h4>
<p>The <b>pin</b> beside a shot in the list holds that camera's viewfinder up
whatever you click next — so you can drag a light, a chair or an actor around
while watching what it does to the frame. Pin again, or <b>Unpin</b> on the
panel, to let it follow the selection again.</p>
<h4>Standing, sitting, on the floor</h4>
<p>Men get one line across the face, women two. Shoulders are drawn at the real
widths too, 18 inches against 14.</p>
<p>A chain of positions is a diagram, so the plan shows all of them at once.
Down the lens you're looking at the room at one moment, and there is only ever
one of anybody in it — so the viewer shows the position this beat belongs to
and leaves the rest out. Play it and you watch one person walk.</p>
<p>On the plan a person is what you actually see looking down at them: the
crown of the head, the shoulders spread round it, and their feet just showing
in front. There is no face, because from up there there isn't one. It is the
shape every good lighting diagram uses and it holds up at any size.</p>
<p>Everybody is built to real height — an average adult is five foot eight, so
that is what they are, with men a little over and women a little under. Down
the lens they are the same person in one solid colour with a darker head, and a
nose so you can see which way they are looking. A man is a shield, narrow at
the hips and widening to the shoulders where the arms are part of the mass; a
woman is a bell — a waist, then a skirt out to the hem. Nothing else: at the
size these draw, a face only ever reads as a toy, and the colour is what tells
you who it is.</p>
<h4>Getting a frame out of the lens view</h4>
<p>Three buttons under the through-the-lens view. <b>Storyboard</b> drops that
frame onto the plan as a real storyboard object beside its camera — drag it
where you want it, and it saves in the scene like any other. <b>Save PNG</b>
writes the frame out at four times the size. <b>AI Brief</b> copies a written
description of that exact shot: the lens and format from your package, the lens
height off whatever it is rigged on, the field of view in degrees, the size of
the room off the walls you drew, and every person in frame with their distance
from the lens, where they sit in the frame, which way they face and whether
they are standing, sitting or on the floor.</p>
<p>Hand an image model the frame and the brief together and it has the geometry
as a picture and the facts as words, which is a great deal closer to your shot
than describing it from memory. Nothing in the brief is invented — it is all
measured off the scene.</p>
<h4>Your cast</h4>
<p><b>Name…</b> on a person gives them a name, which draws under them on the
plan — always the right way up, whichever way they face — and is what the AI
brief calls them. Naming somebody also saves them, so <b>Add Character</b>
offers them by name from then on and drops them in already coloured and cast.
Colours run out; names don't. <b>Edit Cast…</b> is a plain list you can
rewrite.</p>
<p>Right-click a person for <b>Posture</b>. It isn't decoration — it sets the
height the lens sees them at (a seated head tops out around 4'4", a standing one
at 5'9") and it changes the floor they take up. Somebody lying down is drawn at
their real six feet, pointed the way they're facing, because on a plan the floor
space is the whole argument. Select several people first and the choice applies
to all of them.</p>
<p>A seated figure gets a chair bracket behind them in furniture grey. Look
through the lens with <kbd>V</kbd> and the three read at their proper
heights — which is usually how you find out the camera needs to come down.</p>
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
shot. <kbd>Esc</kbd> always leaves you with nothing armed.</p>
<h4>Getting a floorplan in</h4>
<p><b>Drop the file on the plan.</b> Or paste a picture — <kbd>⌘V</kbd> — which
is how one usually reaches you anyway: a screenshot, or something somebody
sent. <b>Add ▸ Add Floorplan…</b> if you would rather go looking for it.</p>
<p>However it arrives it goes in behind everything, on every page, and then
offers you the scale, because a plan you cannot measure against is a picture.
Say Later if you are in a hurry; <b>Set Scale…</b> on the background is there
whenever you want it.</p>
<h4>Tracing over a floorplan</h4>
<p>Most plans arrive as a picture — a survey, a phone photo of a plan on a wall,
something an agent sent. It reads fine to you and means nothing to the app:
no 3D, no lens height against a real wall, no brief that knows the size of the
room. Tracing turns the picture into geometry.</p>
<h4>Letting it find them</h4>
<p><b>Find The Walls…</b> on the background reads them off the picture. A
floorplan is mostly paper, its walls are the darkest thing on it, and they run
square — which is enough to pick them out in about a second, against the few
minutes it takes to click a scene by hand.</p>
<p>What it finds is drawn over the plan in blue and applied only when you say
so. It will also offer you a dimension line, the border of the drawing, or the
edge of the table somebody photographed the plan on; those are quicker to
delete than the rest were to draw. It reads straight walls, not curves or
diagonals. Set the scale first, or they arrive at whatever size the picture
is.</p>
<h4>Tracing them yourself</h4>
<p>Right-click the background and pick <b>Trace Walls…</b>, or press
<kbd>⇧W</kbd>. It offers to set the scale first — drag a line along something
whose length you know, a door is three feet — because a wall traced at the
wrong size is worse than no wall at all: it looks right and lies about every
distance in the scene.</p>
<dl>
<dt>Square by default</dt><dd>The opposite of the wall tool, because plans are
square. Hold <kbd>⌥</kbd> for anything that isn't.</dd>
<dt>Close a room</dt><dd>Click back on the corner you started from. The last
corner is pulled square as it closes, so the walls actually meet — a room whose
corners nearly touch looks fine on the plan and falls apart in 3D.</dd>
<dt>Keep going</dt><dd>It stays armed room after room. <kbd>Esc</kbd> when
you're done.</dd>
</dl>`,
  },
  {
    id: "kit",
    title: "The kit",
    body: `
<p>A <b>prop</b> here means what it means on a set: something a person picks
up. It is not a sofa. Furniture, vehicles, trees and grip each have their own
heading, which is the difference between a menu you read and a menu you
search.</p>
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
works best — and it behaves like any other prop.</p>
<h4>Track and rigs</h4>
<p><b>Lay Dolly Track…</b> builds a run out of what comes off the truck — 4ft,
8ft and 10ft straights, 45° and 90° curves — at the real 24.5-inch gauge. The
panel keeps a running tally, which is what you'd hand the key grip. Turn the
whole run with <kbd>[</kbd> and <kbd>]</kbd> or its handle; it pivots about the
middle of the run so it stays where you put it. Hold <kbd>⌥</kbd> to turn off
the fifteen-degree detents. Track sections don't bend, so a laid run moves and
turns as one piece rather than corner by corner.</p>
<p><b>Add Rigged Camera…</b> gives you a dolly, a dolly with a Jib 21, a bare
jib, or a slider, camera already on it. It comes apart the way the real thing
does:</p>
<dl>
<dt>The base takes the track</dt><dd>Drop it near track and it takes it. After
that the base only goes where the track goes — select it and drag to run it up
and down. <kbd>⌥</kbd>-drag lifts it clear of the track altogether, and dropping
it by rails again puts it back on. There's <b>Take Off Track</b> in its menu if
you'd rather say it than hold a key.</dd>
<dt>The arm only articulates</dt><dd>Drag the camera and it swings on the arm.
It can't leave the arm and it can't take the track itself; the faint circle is
the sweep it can reach. A Fisher Jib 21 is 5'10", which is shorter than most
people draw it. <b>Arm Reach…</b> sets it to something else for a 23.</dd>
</dl>
<h4>Moving a dolly, and moving the camera on it</h4>
<p>Track first. A dolly only goes where the track goes, so ask for a move
before there is any and it offers to lay some — and once it is down you build
the run out of real pieces in the panel: 4, 8 and 10 foot straights, 45s and
90s. The tally is what you would ask the key grip for.</p>
<p>Then the two moves, which you set separately.</p>
<dl>
<dt>The dolly</dt><dd>Select it and the panel shows <b>Dolly positions</b>:
where it stands at each beat, in feet along the run, because that is the number
you say out loud on the day. Slide it to where you want it and press the beat
number. It stays on the rails the whole way — what runs between two marks is
how far along the track it is, so it takes a corner rather than cutting across
it, and re-laying the track carries the positions with it.</dd>
<dt>The camera on it</dt><dd><b>Add a Swing / Rise…</b> on the camera. Its
positions are not places on the floor — that is the dolly's business. They are
where it sits on the arm, how high the lens is and how far it is tilted. So a
jib can be rising and swinging while the base is still running.</dd>
</dl>
<p>Then the camera goes where both of them put it. It animates because it is
attached, not because it was told to, which means you can set either one
without touching the other. Both menus offer the other one too — <b>Move The
Dolly…</b> from the camera, <b>Move The Camera On It…</b> from the base — so
you never have to go hunting for the half you did not select.</p>
<p>Track is for dollies. A camera on its own doesn't need any — give it
<b>Add a Move…</b> instead. Lay track with <kbd>T</kbd> and drop a dolly near it
and the dolly takes it.</p>
<p>Deleting the camera off a dolly takes the dolly and its track with it, and
deleting a dolly takes its track unless something else is riding the same run.</p>
<h4>Moving track after you've laid it</h4>
<p>Select a run and the arrow keys nudge the whole thing two units at a time,
<kbd>⇧</kbd> for twenty — anything riding it comes along. <kbd>[</kbd> and
<kbd>]</kbd> turn it about its own middle.</p>
<p>When the run is simply in the wrong place: <kbd>⌥</kbd>-drag the dolly to
where you actually want it, then <b>Lay New Track From Here</b> on it. It runs
fresh track out from where the dolly now stands and strikes the old run — unless
something else is still riding it, in which case the old run stays. <kbd>⌘Z</kbd>
brings it back either way.</p>
<h4>Positions</h4>
<p>Cameras and figures get more than one position the same way here as in the
original: <b>a position is another copy, tagged with the time it belongs to</b>.
Hit <b>Add position</b> and you get a second one, tagged for the next slice.
Move it and that's position two.</p>
<p><b>Every position shows on the page at once, numbered.</b> That's what makes
it an overhead — you can hand someone a sheet where the camera is visibly at 1
and at 2, rather than a diagram that only shows one of them at a time. Blocking
mode is the thing that steps them one by one.</p>
<p>The dolly and the camera keep their own numbering. Pick the base and
<b>Add position</b> gives the dolly a second place along the track; pick the
camera and it gives the arm a second swing. So a move reads as: dolly at 1 and
2, arm swung back at 1 and forward at 2 — each still only able to do what it
physically can.</p>
<p>The numbered buttons say which positions this one is at — click to add or
remove it from a slice, and a position used twice is simply tagged twice, the
same as writing <code>1,4</code> on an actor's mark.</p>
<p>Step the timeline with the numbers at the bottom right, or with
<kbd>←</kbd> <kbd>→</kbd> in blocking mode, and only that position is solid
while the others fall back.</p>
<p>A position holds both halves of the rig — where the base sits on the track
<i>and</i> where the arm is swung. So a move reads the way you'd call it: dolly
from A to B, arm starting swung back and coming forward. Each is still
constrained: the base on its track, the arm within its reach.</p>`,
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
<h4>Straight onto a camera</h4>
<p>Select a camera and press <kbd>⏎</kbd> (or <kbd>E</kbd>). Its shot opens with
everything in one place — camera letter, the shot itself, lens, notes — and if
that camera didn't have a shot yet, it gets one. Retype the shot line in
shorthand and it re-reads it.</p>
<h4>Your package</h4>
<h4>Changing a lens</h4>
<p>Select a camera and the lens chips in the shot list become that camera's
lens — one click and it's on a 50, with the one it's on marked. With nothing
selected the same chips help you type a new shot instead.</p>
<p>The other two ways: press <kbd>⏎</kbd> on a camera and type it in the Lens
field, or put the number on the end of the shot line — <code>ots d to m 50</code>.</p>
<p><b>☰ ▸ Camera Package…</b> is what you're actually carrying: the lenses in
the case, in the order you reach for them, and the support that's on the truck.
The lens chips and the rig menu follow it, so the app stops offering you a 135
you don't own. Packages are named, so a show with primes and a show with zooms
can each have their own. It's remembered in the browser you set it in.</p>
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
    id: "lens",
    title: "Seeing what the lens sees",
    body: `
<p>Two things that turn a plan into something you can argue about with a
director. Both are under <b>Layers</b> (<kbd>L</kbd>), and both are off until
you want them.</p>
<h4>Lens coverage</h4>
<p>Draws the wedge each camera actually covers, at the real angle for that focal
length on the body in your package — a 50 on Super35 is about 27°. Watching the
wedge land on somebody or miss them settles it faster than talking about it.
A camera only draws a wedge once it has a lens.</p>
<h4>Through the lens</h4>
<p><kbd>V</kbd>, then pick a camera. A rough view from where it stands: walls at
nine feet, people at five foot nine, furniture at the heights furniture has.
Grey boxes and simple figures, updating as you drag. It's for answering "is she
behind the sofa" in ten seconds, not for looking like the film.</p>
<p>It only tells the truth if the plan is drawn to distance. A schematic where
the camera sits a foot from the actor will show an empty frame — and it says so,
with how far away the nearest person actually is, rather than leaving you
guessing.</p>
<h4>Getting a plan to scale</h4>
<p>Which is what <b>Set Scale…</b> on a background image is for. Drop in a
blueprint or a map, draw a line along something you know — a doorway, a scale
bar, the length of a car — and say what it really is. The image resizes so the
grid is true, and from then on everything measured off it is real: track
lengths, lens choices, whether the dolly fits.</p>`,
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
<p><b>Layers</b> (<kbd>L</kbd>) turns whole categories down — lighting, grip,
walk arrows, storyboard frames — when you want the diagram to say one thing.
Storyboard frames you've pinned to a plan draw in their black surround with
their caption underneath.</p>
<h4>Locking what you've already built</h4>
<p>Clicking a layer cycles it through three states: <b>shown</b>, <b>shown but
locked</b>, and <b>hidden</b>. Locked is the one you'll live in — the set stays
on the page and stops being something you can drag by accident while you work
cameras and actors on top of it. Locked things ignore clicks, marquees and
Select All.</p>
<p><b>Lock Set, Props &amp; Backgrounds</b> does the three in one go, which is
usually the moment the room is right and you want to stop touching it. Camera
support has its own layer and isn't caught by that — a dolly is equipment, not
set dressing, and you'll be moving it long after the room is settled.</p>
<p>Dragging locked scenery <b>pans the drawing</b> — it's a surface, not a hole,
so grabbing the floorplan pushes the whole page around. A selection sweep only
starts from genuinely empty canvas. Click into something locked and it tells you
which layer is holding it.</p>`,
  },
  {
    id: "files",
    title: "Files, and getting it to people",
    body: `
<p>Scenes are <code>.hcw</code> files, read and written in place from your
scenes folder — so a library you already have opens as it is, and anything you
save here still opens anywhere else that reads the format. Every save leaves a
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
director a read-only URL that needs no app and no account.</p>
<h4>Workspaces</h4>
<p>A workspace is a name and a folder of scenes. There is always one, and out of
the box it is the folder Shot Designer itself uses — so if you never open this
menu, nothing about how you work changes.</p>
<p><b>Workspaces…</b> adds another. A second workspace is a second folder and
nothing more: it cannot see the first, adding one puts no file inside the one
you are in, and taking one off the list leaves every scene in it where it was.
Mark one <b>read-only</b> and scenes there open and plan normally but are never
written — which is the setting for a folder another program owns.</p>
<h4>To Blender</h4>
<p><b>Export To Blender…</b> writes a script that builds the scene: walls at
their real length with the openings cut, blocks where the furniture is,
stand-ins where the people are, and the cameras with the actual sensor, focal
length and squeeze — keyframed across the beats, so a move you built plays
there too. Open it in Blender's Scripting tab and press Run.</p>
<p>It goes one way on purpose. Nothing reads anything back, so a render pass
can never quietly rewrite the plan it came from. Everything lands in its own
collection; delete the collection to take it all out again.</p>`,
  },
  {
    id: "keys",
    title: "Every shortcut",
    body: `
<table>
<tr><td><kbd>N</kbd></td><td>New shot</td></tr>
<tr><td><kbd>B</kbd> then <kbd>←</kbd> <kbd>→</kbd></td><td>Blocking, step beats</td></tr>
<tr><td><kbd>W</kbd> / <kbd>T</kbd></td><td>Wall tool, dolly track</td></tr>
<tr><td><kbd>M</kbd></td><td>Give it a move, or pin this position</td></tr>
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
