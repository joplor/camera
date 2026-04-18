/**
 * InterventionSystem — translates player actions into world changes.
 *
 * Intercepts `player:interact` events and applies side effects:
 *   - door        → open / unlock / lock
 *   - terminal    → open UI terminal for that console
 *   - panel       → trigger whatever scripted effect it owns
 *
 * This is also where we record "intrusions" into WorldStateManager so the
 * next cycle can reflect them (a door you propped open stays propped).
 */
export class InterventionSystem {
  constructor({ events, worldState, loopManager, facility, ui }) {
    this.events = events;
    this.worldState = worldState;
    this.loopManager = loopManager;
    this.facility = facility;
    this.ui = ui;

    events.on("player:interact", (e) => this._onInteract(e));
    events.on("loop:reset",     () => this._resetPerLoopState());
    events.on("intervention:doorUnlock", ({ id, code }) => this._unlockDoor(id, code));
    events.on("intervention:forceReset", () => this.loopManager.resetCycle({ reason: "forced" }));
    events.on("intervention:blackout", ({ roomId }) => this.events.emit("lighting:blackout", { roomId }));
    events.on("intervention:restore",  ({ roomId }) => this.events.emit("lighting:restore",  { roomId }));
    events.on("intervention:alarm",    () => this._triggerAlarm());
  }

  _resetPerLoopState() {
    // Doors that the world-state says should be unlocked stay unlocked.
    for (const door of this.facility.allDoors()) {
      door.open = false;
      if (this.worldState.isUnlocked(door.id)) {
        door.locked = false;
        door.promptLabel = "OPEN DOOR";
        this._paintDoor(door);
      } else if (door.requiresCode) {
        // Re-lock.
        door.locked = true;
        door.promptLabel = "LOCKED";
        this._paintDoor(door);
      }
    }
    this.events.emit("door:changed");
  }

  _onInteract({ target, player }) {
    if (!target || target.enabled === false) return;

    switch (target.kind) {
      case "door":    this._interactDoor(target); break;
      case "terminal":this._interactTerminal(target); break;
      case "panel":   this._interactPanel(target); break;
      default: break;
    }
  }

  _interactDoor(door) {
    if (door.locked) {
      this.events.emit("hud:hint", {
        text: `DOOR LOCKED · ${door.requiresCode ? `CODE ${door.requiresCode} REQUIRED` : "ACCESS DENIED"}`,
        ttl: 2500,
      });
      return;
    }
    door.open = !door.open;
    // Visually slide the leaf aside a bit by offsetting the mesh.
    const dir = door.side === "east" ? [0, 0, 1.5]
              : door.side === "west" ? [0, 0, -1.5]
              : door.side === "south"? [1.5, 0, 0] : [-1.5, 0, 0];
    if (door.open) {
      door.leaf.position.x = door.position.x + dir[0];
      door.leaf.position.z = door.position.z + dir[2];
    } else {
      door.leaf.position.x = door.position.x;
      door.leaf.position.z = door.position.z;
    }
    this._paintDoor(door);
    this.worldState.recordIntrusion({
      cycle: this.loopManager.cycleIndex,
      zone: door.fromId,
      action: door.open ? "door:opened" : "door:closed",
      t: this.loopManager.cycleTime,
    });
    this.events.emit("door:changed");
  }

  _unlockDoor(id, code) {
    const door = this.facility.allDoors().find((d) => d.id === id);
    if (!door) return;
    if (door.requiresCode && door.requiresCode !== code) {
      this.events.emit("hud:hint", { text: "ACCESS DENIED", ttl: 1500 });
      return;
    }
    door.locked = false;
    door.promptLabel = "OPEN DOOR";
    this.worldState.unlock(door.id);
    this._paintDoor(door);
    this.events.emit("hud:hint", { text: "ACCESS GRANTED", ttl: 2000 });
    this.events.emit("door:changed");
  }

  _paintDoor(door) {
    door.light.material.emissive.setHex(door.locked ? 0xff5f5f : 0x62f7ff);
  }

  _interactTerminal(term) {
    // Hand off to the UI terminal layer.
    this.ui.openTerminal(term);
    this.worldState.recordIntrusion({
      cycle: this.loopManager.cycleIndex,
      zone: term.room?.id ?? "?",
      action: `terminal:${term.id}`,
      t: this.loopManager.cycleTime,
    });
  }

  _interactPanel(panel) {
    if (panel.meta?.unlocks === "hidden") {
      const hidden = this.facility.allDoors().find((d) => d.toId === "hidden");
      if (hidden?.locked) {
        this.events.emit("hud:hint", {
          text: `PANEL ACCEPTED · CODE K7-ΩΩ NOW VALID`, ttl: 2500,
        });
        this.worldState.learn("code:K7-ΩΩ", { source: panel.id });
      }
    }
    this.worldState.recordIntrusion({
      cycle: this.loopManager.cycleIndex,
      zone: panel.room?.id ?? "?",
      action: `panel:${panel.id}`,
      t: this.loopManager.cycleTime,
    });
  }

  _triggerAlarm() {
    this.events.emit("audio:cue", { id: "alarm" });
    this.events.emit("hud:hint", { text: "FACILITY ALARM ENGAGED", ttl: 3000 });
    // Alarms force NPCs into reacting state; AI system listens for anomaly exposure.
    this.events.emit("anomaly:exposure", { to: "alarm", position: { x: 0, y: 0, z: 0 } });
  }
}
