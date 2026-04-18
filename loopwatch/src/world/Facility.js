/**
 * Facility — the procedural builder for KARON-7 sublevel 3.
 *
 * The facility is laid out as a grid of rectangular rooms connected by
 * corridors. Each room has:
 *   - a name and zone tag (CONTROL / LAB / SERVER / OBS / HALL / HIDDEN)
 *   - a bounding box
 *   - a set of "slots" where interactables live (terminal, door, screen, lamp)
 *   - a schedule of ambient lighting behaviour
 *
 * We deliberately avoid loading GLTF assets — this keeps the project a
 * single-copy-paste-into-GitHub deliverable with zero binary dependencies.
 * Everything is primitives composed with shared materials.
 *
 * The `Interactable` list is the contract between this file and the rest of
 * the game: Player.js raycasts against it for the prompt, InterventionSystem
 * mutates it, CameraSystem places CCTV cams using Room.camSlot, and so on.
 */
import * as THREE from "three";
import { makeMaterials } from "./Materials.js";

export const ZONE = Object.freeze({
  CONTROL: "CONTROL",
  LAB_A:   "LAB-A",
  LAB_B:   "LAB-B",
  SERVER:  "SERVER",
  OBS:     "OBSERVATION",
  HALL:    "HALLWAY",
  HIDDEN:  "SUBLEVEL-4",
});

export class Facility {
  constructor({ scene, events, textures }) {
    this.scene = scene;
    this.events = events;
    this.textures = textures;
    this.mats = makeMaterials();

    this.rooms = [];
    this.interactables = [];
    this.lights = [];
    this.screens = [];          // every screen mesh (for image swapping)
    this.doors = [];
    this.camSlots = [];         // { name, position, look, zone }
    this.npcSpawnPoints = [];
    this.playerSpawn = new THREE.Vector3(0, 0, 0);

    this.root = new THREE.Group();
    this.root.name = "Facility";
    this.scene.add(this.root);

    this.build();
  }

  // ---------------------------------------------------------------------
  // Layout definitions
  // ---------------------------------------------------------------------

  /**
   * Returns a flat list of rooms. Coordinates are in world units (meters-ish).
   * `dims` is [width, depth], `center` is [cx, cz].
   *
   * The layout is intentionally asymmetric and cramped — Karon-7 is not a
   * comfortable place.
   */
  roomDefs() {
    return [
      { id: "ctrl",  name: "CONTROL ROOM",      zone: ZONE.CONTROL, center: [ 0,   0  ], dims: [12, 10], tag: "hub" },
      { id: "hall1", name: "CORRIDOR EAST",      zone: ZONE.HALL,    center: [11,   0  ], dims: [ 6,  4], tag: "corridor" },
      { id: "labA",  name: "LABORATORY A",       zone: ZONE.LAB_A,   center: [19,   3  ], dims: [12, 10], tag: "lab" },
      { id: "hall2", name: "CORRIDOR SOUTH",     zone: ZONE.HALL,    center: [ 0, -10  ], dims: [ 6,  6], tag: "corridor" },
      { id: "serv",  name: "SERVER STACK",       zone: ZONE.SERVER,  center: [ 0, -20  ], dims: [14, 10], tag: "server" },
      { id: "hall3", name: "CORRIDOR WEST",      zone: ZONE.HALL,    center: [-12,  0  ], dims: [ 8,  4], tag: "corridor" },
      { id: "labB",  name: "LABORATORY B",       zone: ZONE.LAB_B,   center: [-21,  3  ], dims: [12, 10], tag: "lab" },
      { id: "obs",   name: "OBSERVATION DECK",   zone: ZONE.OBS,     center: [-21,-10  ], dims: [10,  8], tag: "obs" },
      { id: "hidden",name: "UNLISTED",           zone: ZONE.HIDDEN,  center: [19, -10  ], dims: [10,  8], tag: "hidden" },
    ];
  }

  build() {
    // Global floor — a large dark plane under the whole facility. Rooms
    // paint their own brighter floors on top of this.
    const outerFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x05080a, roughness: 1 }),
    );
    outerFloor.rotation.x = -Math.PI / 2;
    outerFloor.position.y = -0.02;
    outerFloor.receiveShadow = true;
    this.root.add(outerFloor);

    // Ceiling — a dark flat plane so skybox doesn't leak in.
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      this.mats.ceiling,
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 4;
    this.root.add(ceil);

    for (const def of this.roomDefs()) {
      const room = this.buildRoom(def);
      this.rooms.push(room);
    }

    // Stitch corridors: carve door gaps by spawning door-frame meshes at
    // known inter-room junctions. The door system tracks lock state.
    this.spawnDoor("ctrl",  "hall1", [ 6.0, 0,  0  ], "east");
    this.spawnDoor("hall1", "labA",  [14.0, 0,  0  ], "east");
    this.spawnDoor("ctrl",  "hall2", [ 0,   0, -5  ], "south");
    this.spawnDoor("hall2", "serv",  [ 0,   0,-15  ], "south");
    this.spawnDoor("ctrl",  "hall3", [-6.0, 0,  0  ], "west");
    this.spawnDoor("hall3", "labB",  [-15.0, 0, 0  ], "west");
    this.spawnDoor("labB",  "obs",   [-21.0, 0,-6  ], "south");
    this.spawnDoor("hall1", "hidden",[19.0, 0, -6  ], "south", { locked: true, requiresCode: "K7-ΩΩ" });

    // Populate each room with props + interactables.
    for (const room of this.rooms) {
      this.populateRoom(room);
    }

    // Player spawn in the middle of the Control Room.
    this.playerSpawn.set(0, 0, 2);

    this.events.emit("world:built", {
      rooms: this.rooms.length,
      interactables: this.interactables.length,
      cams: this.camSlots.length,
    });
  }

  buildRoom(def) {
    const [w, d] = def.dims;
    const [cx, cz] = def.center;
    const group = new THREE.Group();
    group.name = def.name;
    group.position.set(cx, 0, cz);

    // Floor tile — slightly brighter than outer floor, with a glowing outline.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), this.mats.floor);
    floor.position.y = 0;
    floor.receiveShadow = true;
    group.add(floor);

    // Floor outline strip (emissive).
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w - 0.1, 0.01, d - 0.1)),
      new THREE.LineBasicMaterial({ color: 0x2fd666 }),
    );
    outline.position.y = 0.03;
    group.add(outline);

    // Walls around the room, with holes at door positions. For simplicity
    // we build walls as 4 box segments and let doors punch through visually
    // via their own frame meshes sitting above the wall line.
    const wallH = 3.8;
    const t = 0.25;
    const mkWall = (width, depth, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(width, wallH, depth), this.mats.wall);
      m.position.set(x, wallH / 2, z);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
      return m;
    };
    mkWall(w, t,  0,  d / 2);   // north
    mkWall(w, t,  0, -d / 2);   // south
    mkWall(t, d,  w / 2, 0);    // east
    mkWall(t, d, -w / 2, 0);    // west

    // Trim along the top of each wall.
    const trimH = 0.15;
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(w, trimH, d),
      this.mats.wallTrim,
    );
    trim.position.y = wallH - trimH / 2;
    group.add(trim);

    this.root.add(group);

    const room = {
      ...def,
      group,
      floor, outline,
      interactables: [],
      lights: [],
      screens: [],
      min: new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
      max: new THREE.Vector3(cx + w / 2, wallH, cz + d / 2),
    };
    return room;
  }

  populateRoom(room) {
    const mats = this.mats;

    // Every room gets ceiling lamps.
    const lamps = this.populateLamps(room);
    room.lights.push(...lamps);

    // A CCTV cam in the corner, looking at the room center.
    const cam = this.populateCamera(room);
    this.camSlots.push(cam);

    // Zone-specific props.
    switch (room.zone) {
      case ZONE.CONTROL:  this.populateControlRoom(room); break;
      case ZONE.LAB_A:    this.populateLab(room, "A");    break;
      case ZONE.LAB_B:    this.populateLab(room, "B");    break;
      case ZONE.SERVER:   this.populateServerRoom(room);  break;
      case ZONE.OBS:      this.populateObservation(room); break;
      case ZONE.HALL:     this.populateHallway(room);     break;
      case ZONE.HIDDEN:   this.populateHidden(room);      break;
    }

    this.interactables.push(...room.interactables);
    this.screens.push(...room.screens);
    this.lights.push(...room.lights);
  }

  // ---------- shared room elements --------------------------------------

  populateLamps(room) {
    const [w, d] = room.dims;
    const lamps = [];
    const nx = Math.max(1, Math.round(w / 6));
    const nz = Math.max(1, Math.round(d / 6));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = (-w / 2) + ((i + 0.5) * w / nx);
        const z = (-d / 2) + ((j + 0.5) * d / nz);

        const fixture = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.12, 0.5),
          this.mats.lightFixture,
        );
        fixture.position.set(x, 3.7, z);
        room.group.add(fixture);

        const light = new THREE.PointLight(0xcfffdc, 1.4, 10, 1.8);
        light.position.set(x, 3.5, z);
        light.castShadow = false;
        room.group.add(light);

        lamps.push({ fixture, light, baseIntensity: 1.4, state: "on" });
      }
    }
    return lamps;
  }

  populateCamera(room) {
    const [w, d] = room.dims;
    const [cx, cz] = room.center;
    // Place the cam in the ceiling corner closest to the room's first wall.
    const x = -w / 2 + 0.6;
    const z = -d / 2 + 0.6;
    const housing = new THREE.Group();
    housing.position.set(x, 3.4, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), this.mats.metalDark);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.12, 12), this.mats.metal);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, -0.1, 0.3);
    const led  = new THREE.Mesh(new THREE.SphereGeometry(0.03), this.mats.interactGlow);
    led.position.set(0.12, -0.05, 0.3);
    housing.add(body, lens, led);
    // Aim lens toward room center (local offset).
    housing.lookAt(new THREE.Vector3(0, 1.2, 0));
    room.group.add(housing);

    return {
      name: `CAM-${this.camSlots.length + 1}`.padEnd(6, " "),
      zone: room.zone,
      roomId: room.id,
      position: new THREE.Vector3(cx + x, 3.4, cz + z),
      look: new THREE.Vector3(cx, 1.2, cz),
      group: housing,
      corrupted: false,
      noteText: "—",
    };
  }

  populateControlRoom(room) {
    // Central console bank with several terminals.
    const console1 = this.buildTerminal(room, -2, 3.5, 0, "K7-MAIN",   { codes: true });
    const console2 = this.buildTerminal(room,  2, 3.5, 0, "K7-CCTV",   { cctv: true });
    const console3 = this.buildTerminal(room,  0, -3.5, Math.PI, "K7-AUDIO", { audio: true });

    // Big wall screen showing the facility logo + image_a.
    this.buildWallScreen(room, 0, 4.6, -4.95, 0, "logo");

    // Chairs.
    this.buildChair(room, -2, 4.2);
    this.buildChair(room,  2, 4.2);
    this.buildChair(room,  0, -4.3);

    // Control panel row.
    for (let i = -4; i <= 4; i += 2) {
      this.buildPanelPlinth(room, i, -2);
    }
  }

  populateLab(room, letter) {
    // Lab tables with "specimens" (glowing cylinders under glass).
    for (let i = -1; i <= 1; i += 2) {
      this.buildLabTable(room, i * 3, 0, letter);
    }
    // Side terminal with the "research" interaction.
    this.buildTerminal(room, -4.5, -3.5, Math.PI / 2, `LAB-${letter}-NOTES`, { research: letter });
    // A mirror / observation glass.
    this.buildObservationGlass(room, 0, 4.9);
    // Hanging screen (this is where image_a / image_b appear).
    this.buildWallScreen(room, 4.8, 2.2,  0, Math.PI / 2, letter === "A" ? "subjectA" : "subjectB");
  }

  populateServerRoom(room) {
    // Rows of server racks. Each rack is a tall cabinet with emissive slits.
    for (let i = -5; i <= 5; i += 2) {
      this.buildServerRack(room, i, -3);
      this.buildServerRack(room, i,  3);
    }
    // Central console to toggle server power.
    this.buildTerminal(room, 0, 0, 0, "SERV-MAIN", { power: true });
    // A small panel the player can activate to reveal a hidden room.
    this.buildInteractPanel(room, -6, 4.5, "SERV-PANEL-Ω");
  }

  populateObservation(room) {
    // Large glass window on one wall; on the far side, a dark void with
    // occasional image_b sightings (the anomaly manager plants a sprite here).
    const glassPane = new THREE.Mesh(
      new THREE.BoxGeometry(8, 2.6, 0.05),
      this.mats.glass,
    );
    glassPane.position.set(0, 1.6, -3.95);
    room.group.add(glassPane);

    // Behind the glass: a dark chamber volume. The anomaly system parents
    // its sprites here.
    const voidGroup = new THREE.Group();
    voidGroup.name = "obs-void";
    voidGroup.position.set(0, 0, -6);
    room.group.add(voidGroup);
    room.voidGroup = voidGroup;

    this.buildTerminal(room, 3, -3, Math.PI, "OBS-LOG", { log: true });
    this.buildChair(room, -2, -3);
    this.buildChair(room,  2, -3);
  }

  populateHallway(room) {
    // Vending machine / locker feel.
    this.buildLocker(room, -2, 0);
    this.buildLocker(room,  2, 0);
    // Flickering wall lamp.
    this.buildWallLamp(room, 0, 2.5, 0);
  }

  populateHidden(room) {
    // Low light. A single terminal and the ending trigger.
    this.buildTerminal(room, 0, 0, 0, "Ω-CORE", { core: true });
    this.buildAnomalyPillar(room, 0, -2);
  }

  // ---------- props ------------------------------------------------------

  buildTerminal(room, x, z, rotY, id, meta = {}) {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.0, 0.7),
      this.mats.terminalBody,
    );
    base.position.set(x, 0.5, z);
    base.rotation.y = rotY;
    base.castShadow = true;
    room.group.add(base);

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.65, 0.05),
      this.mats.screen.clone(),
    );
    screen.position.set(0, 0.3, 0.38);
    base.add(screen);
    room.screens.push({ mesh: screen, kind: "terminal", id, slot: "image_a" });

    const kbd = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.04, 0.25),
      this.mats.metalDark,
    );
    kbd.position.set(0, 0.02, 0.48);
    kbd.rotation.x = -0.2;
    base.add(kbd);

    // Small interact glow disc under the screen to telegraph interactivity.
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.01, 16),
      this.mats.interactGlow.clone(),
    );
    glow.position.set(0.4, 0.01, 0.38);
    glow.rotation.x = Math.PI / 2;
    base.add(glow);

    const interactable = {
      id,
      kind: "terminal",
      meta,
      room,
      mesh: base,
      position: new THREE.Vector3(),
      promptLabel: `ACCESS ${id}`,
      glow,
      enabled: true,
    };
    interactable.mesh.userData.interactable = interactable;
    base.getWorldPosition(interactable.position);
    room.interactables.push(interactable);
    return interactable;
  }

  buildWallScreen(room, x, y, z, rotY, slot) {
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.6, 0.12),
      this.mats.metalDark,
    );
    bezel.position.set(x, y, z);
    bezel.rotation.y = rotY;
    room.group.add(bezel);

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 1.4, 0.02),
      this.mats.screen.clone(),
    );
    screen.position.set(0, 0, 0.07);
    bezel.add(screen);

    room.screens.push({ mesh: screen, kind: "wall", id: `${room.id}-wall-${slot}`, slot });
    return screen;
  }

  buildChair(room, x, z) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), this.mats.metal);
    seat.position.set(x, 0.5, z);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.1), this.mats.metal);
    back.position.set(x, 0.9, z - 0.25);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), this.mats.metalDark);
    post.position.set(x, 0.25, z);
    room.group.add(seat, back, post);
  }

  buildPanelPlinth(room, x, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.6), this.mats.terminalBody);
    m.position.set(x, 0.35, z);
    room.group.add(m);
    // Tiny blinking LEDs on top.
    for (let i = -2; i <= 2; i++) {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.025), this.mats.interactGlow.clone());
      led.position.set(i * 0.15, 0.72, 0);
      m.add(led);
    }
  }

  buildLabTable(room, x, z, letter) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1), this.mats.metal);
    top.position.set(x, 0.9, z);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.8), this.mats.terminalBody);
    leg.position.set(x, 0.45, z);
    room.group.add(top, leg);

    // Specimen chamber — a glass cylinder with a glowing rod inside.
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.7, 16, 1, true),
      this.mats.glass,
    );
    glass.position.set(x, 1.3, z);
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.6, 12),
      new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: letter === "A" ? 0x62f7ff : 0xc88bff,
        emissiveIntensity: 1.5,
      }),
    );
    rod.position.set(x, 1.3, z);
    room.group.add(glass, rod);
  }

  buildObservationGlass(room, x, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 0.05), this.mats.glass);
    m.position.set(x, 1.5, z - 0.1);
    room.group.add(m);
  }

  buildServerRack(room, x, z) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.8, 0.9), this.mats.terminalBody);
    rack.position.set(x, 1.4, z);
    room.group.add(rack);
    for (let i = 0; i < 6; i++) {
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.05, 0.02),
        this.mats.interactGlow.clone(),
      );
      slit.position.set(0, -1 + i * 0.35, 0.46);
      rack.add(slit);
    }
  }

  buildInteractPanel(room, x, z, id) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.2), this.mats.terminalBody);
    m.position.set(x, 1.2, z);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16), this.mats.interactGlow.clone());
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0, 0, 0.13);
    m.add(btn);
    room.group.add(m);

    const interactable = {
      id,
      kind: "panel",
      meta: { unlocks: "hidden" },
      room,
      mesh: m,
      position: new THREE.Vector3(),
      promptLabel: `PRESS ${id}`,
      glow: btn,
      enabled: true,
    };
    m.userData.interactable = interactable;
    m.getWorldPosition(interactable.position);
    room.interactables.push(interactable);
    return interactable;
  }

  buildLocker(room, x, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.6), this.mats.metalDark);
    m.position.set(x, 1.1, z);
    room.group.add(m);
  }

  buildWallLamp(room, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.2), this.mats.lightFixture.clone());
    m.position.set(x, y, z);
    const light = new THREE.PointLight(0xcfffdc, 0.4, 4);
    light.position.copy(m.position);
    room.group.add(m, light);
    room.lights.push({ fixture: m, light, baseIntensity: 0.4, state: "on", flicker: true });
  }

  buildAnomalyPillar(room, x, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 16), this.mats.anomalyMat);
    m.position.set(x, 1.5, z);
    room.group.add(m);
    const light = new THREE.PointLight(0xc88bff, 2, 8);
    light.position.set(x, 1.8, z);
    room.group.add(light);
    room.lights.push({ fixture: m, light, baseIntensity: 2, state: "on", anomaly: true });
  }

  spawnDoor(fromId, toId, pos, side, opts = {}) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.4), this.mats.metalDark);
    frame.position.set(pos[0], 1.6, pos[2]);
    this.root.add(frame);

    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 0.15), this.mats.door.clone());
    leaf.position.set(pos[0], 1.4, pos[2]);
    this.root.add(leaf);

    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: opts.locked ? 0xff5f5f : 0x62f7ff,
        emissiveIntensity: 1.2,
      }),
    );
    light.position.set(pos[0] + 1.0, 2.2, pos[2]);
    this.root.add(light);

    const door = {
      id: `door:${fromId}-${toId}`,
      fromId, toId, side,
      frame, leaf, light,
      locked: !!opts.locked,
      requiresCode: opts.requiresCode ?? null,
      open: false,
      position: new THREE.Vector3(pos[0], 0, pos[2]),
      kind: "door",
      promptLabel: opts.locked ? "LOCKED" : "OPEN DOOR",
      mesh: leaf,
      enabled: true,
      meta: { fromId, toId },
    };
    leaf.userData.interactable = door;
    this.doors.push(door);
    this.interactables.push(door);
    return door;
  }

  // ---------- queries ----------------------------------------------------

  zoneAt(position) {
    for (const room of this.rooms) {
      if (position.x >= room.min.x && position.x <= room.max.x &&
          position.z >= room.min.z && position.z <= room.max.z) {
        return { room, zone: room.zone, name: room.name };
      }
    }
    return { room: null, zone: "VOID", name: "—" };
  }

  allInteractables() { return this.interactables; }
  allScreens()       { return this.screens; }
  allCamSlots()      { return this.camSlots; }
  allDoors()         { return this.doors; }
  allRooms()         { return this.rooms; }
  allLights()        { return this.lights; }

  // Flat list of every mesh that should block the player's ray-based movement.
  collisionMeshes() {
    const out = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      // Doors are handled separately by the open/lock system.
      if (o.userData.interactable?.kind === "door") return;
      // Screens / LEDs / small props are not colliders.
      if (o.userData.noCollide) return;
      out.push(o);
    });
    return out;
  }
}
