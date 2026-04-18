# LOOPWATCH

> A psychological sci-fi game where the player observes a research facility
> stuck in a time loop, and slowly realises the surveillance is running in
> both directions.

Loopwatch is a **single-page 3D game** — pure HTML / CSS / JavaScript + Three.js from a CDN. No build step. No Node. No Python. Paste it into a GitHub repo, turn on GitHub Pages, and it runs.

![LOOPWATCH](assets/image_a.png)

---

## Running locally

### Option 1 — Any static server

Serve the project root and open `index.html` in a modern browser (Chrome / Firefox / Edge). Three.js is loaded from unpkg via an import map, so the only requirement is that the files are served over `http://` or `https://` (not `file://`).

```bash
# Python
python -m http.server 8090

# Node
npx serve . -p 8090

# Windows PowerShell (zero-install, included in this repo)
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8090
```

Then visit <http://localhost:8090>.

### Option 2 — GitHub Pages

1. Create a new GitHub repository.
2. Copy every file and folder from this project into it.
3. Commit + push.
4. In the repo's **Settings → Pages**, set **Source = Deploy from a branch → main / root**.
5. Wait 30 seconds. The game is live at `https://<you>.github.io/<repo>/`.

Everything is static; there is no server-side code, no secrets, and no analytics.

---

## Controls

| Action             | Key / Mouse                 |
|--------------------|-----------------------------|
| Move               | `W` `A` `S` `D` / arrows    |
| Run                | `Shift`                     |
| Crouch             | `Ctrl`                      |
| Look               | Mouse (pointer-locked)      |
| Zoom camera        | Mouse wheel                 |
| Interact           | `E`                         |
| Flashlight         | `F`                         |
| Surveillance grid  | `Tab`                       |
| Cycle CCTV feed    | `1`–`9` (while in CCTV)     |
| Record anomaly     | `R` (while in CCTV)         |
| Mute / unmute      | `M`                         |
| Pause              | `Escape`                    |

---

## The loop

Each loop runs for 10 minutes of in-facility time. At the end:

- The world resets.
- NPC schedules are rerolled with a seed mixed from the new cycle index, so the "base loop" is reproducible but every loop feels slightly different.
- The **anomaly index** nudges upward (+0.07 by default).
- Your accumulated **knowledge**, **unlocks**, and **sightings** persist.

Anomaly behaviour escalates through five phases inside a single cycle:
`settle → routine → drift → rupture → collapse`. During *drift* and later, lamps flicker, wall screens swap image_a for image_b, camera feeds corrupt, and the facility occasionally stutters.

---

## Subject A and Subject B

The two images define the visual and psychological vocabulary of the game.

* `assets/image_a.png` → **stable** subject. Displayed on screens, reflected in glass, appears calm.
* `assets/image_b.png` → **anomalous** subject. Replaces image_a at random; corrupts CCTV feeds; manifests as a floating sprite near the player at high anomaly levels; increases anomaly index when stared at.

**Custom images are optional.** If the files exist, they're loaded. If not, the game generates phosphor-green and purple placeholder textures at boot. To use your own:

1. Drop `image_a.png` and `image_b.png` into the `assets/` directory. Square, 512×512 or larger is ideal.
2. Reload.

Looking at image_b directly for more than a second or so spikes the anomaly index and triggers an `anomaly:exposure` event. NPCs in the same zone react (they freeze). The glitch post-pass spikes briefly.

---

## Endings

There are four recorded endings:

| ID            | How                                                             |
|---------------|-----------------------------------------------------------------|
| `compliant`   | Follow Subject A's cues; never break a rule                     |
| `defiant`     | Intervene, but never expose yourself to image_b                 |
| `witness`     | Complete 5+ cycles without any intrusion                        |
| `loopbreaker` | At the hidden Ω-CORE terminal, type `forget yes`                |

The hidden terminal requires code `K7-ΩΩ`, which is not given to you. It's earned by pressing a specific panel in the server room, then unlocking a door from the Control Room's main console.

---

## Project structure

```
loopwatch/
├── index.html                 ← DOM scaffolding + import map
├── style.css                  ← phosphor green lab console
├── serve.ps1                  ← zero-dep PowerShell static server
├── assets/
│   ├── image_a.png            ← stable subject (optional)
│   └── image_b.png            ← anomalous subject (optional)
└── src/
    ├── main.js                ← bootstrap + game state machine
    ├── core/
    │   ├── EventSystem.js     ← pub/sub bus + transcript
    │   ├── LoopManager.js     ← cycle clock + phase dispatch
    │   ├── WorldStateManager.js ← memory that survives loops
    │   └── SaveSystem.js      ← localStorage persistence
    ├── world/
    │   ├── Facility.js        ← procedural 3D facility
    │   ├── Lighting.js        ← ambient + flicker + blackouts
    │   ├── Materials.js       ← shared THREE materials
    │   └── Textures.js        ← image_a/b loader with fallback
    ├── entities/
    │   ├── Input.js           ← keyboard state + edge triggers
    │   ├── Player.js          ← third-person controller
    │   ├── NPC.js             ← scientist visuals
    │   └── AIBehaviorSystem.js ← NPC schedules + reactions
    ├── systems/
    │   ├── CameraSystem.js    ← main camera + anomaly shake
    │   ├── SurveillanceSystem.js ← CCTV rendering + corruption
    │   ├── InterventionSystem.js ← player actions → world changes
    │   ├── RealityInstability.js ← glitch intensity curve
    │   └── AnomalyManager.js  ← image_a/b manifestation rules
    ├── ui/
    │   ├── UIManager.js       ← top-level screen switcher
    │   ├── Boot.js            ← boot log sequence
    │   ├── MainMenu.js        ← terminal-style menu
    │   ├── HUD.js             ← in-game overlay
    │   ├── CCTVUI.js          ← camera grid UI
    │   └── Terminal.js        ← in-world command line
    ├── audio/
    │   └── AudioManager.js    ← procedural Web Audio API sounds
    ├── shaders/
    │   ├── Composer.js        ← EffectComposer wiring
    │   └── GlitchPass.js      ← chromatic aberration + tear + grain
    └── utils/
        ├── dom.js             ← $ / $$ / el / show / hide
        └── rng.js             ← mulberry32 + seeded helpers
```

---

## How the loop system works (under the hood)

**`LoopManager`** owns a single in-cycle clock (`cycleTime`) and emits three classes of event:

- `loop:tick` — fixed-rate heartbeat (default 10 Hz)
- `loop:phase` — when the cycle crosses a phase boundary (`settle`, `routine`, `drift`, `rupture`, `collapse`)
- `loop:reset` — when the cycle times out or the player forces a reset

**`WorldStateManager`** is the memory. Every mutation goes through one of a handful of typed methods (`learn`, `unlock`, `recordIntrusion`, `sighted`, `markEnding`, `setFlag`) and emits `world:changed`.

**`SaveSystem`** debounces `world:changed` + `loop:reset` to localStorage. On boot we try to load the save; if the schema mismatches we silently discard it.

**`AIBehaviorSystem`** rebuilds schedules on `loop:reset`, using `new Rng(\`schedule-${cycle}\`)`. NPCs don't know time has looped; they just follow their new plan.

**`AnomalyManager`** escalates image_a → image_b swaps by listening to `loop:phase`. Player exposure is measured by ray-direction dot-product checks against every image_b screen each frame.

**`RealityInstability`** binds the anomaly index (0..1) to a CSS class set (`glitch-low`, `-mid`, `-high`) and a shader uniform in `GlitchPass`. Direct exposures call `glitchPass.spike(amount)` for a one-frame spike that decays.

---

## Debugging hook

After boot, the page exposes a handful of internals on `window.LW`:

```js
LW.skipCycle();            // force-reset the loop
LW.jumpAnomaly(0.9);       // spike the anomaly index
LW.loopManager.cycleIndex; // read the cycle counter
LW.worldState.knowledge;   // the set of facts you know
LW.events.recent("loop:"); // the transcript, filtered
```

---

## Design notes

- **No combat.** The only actions you can take are movement, looking, and a single `E` press per interactable. This game is about paying attention, not winning.
- **Image_a and image_b are diegetic.** They aren't loading screens — they're characters. Every swap is an event. Every screen they land on is tracked.
- **Everything is decoupled via events.** This project deliberately avoids wiring systems directly together — each one publishes and subscribes on the `EventSystem`. Adding a new anomaly type is a matter of listening to the right events and emitting new ones.
- **Zero-install.** This was a hard requirement. No Node, no Python, no build step. A fresh Windows machine can serve this directly with the included PowerShell script.

---

## License

MIT. See [`LICENSE`](LICENSE).
