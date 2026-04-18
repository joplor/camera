/**
 * UIManager — owns every DOM-based UI surface.
 *
 * Screens:
 *   - boot:     initial boot sequence (diegetic log)
 *   - menu:     main terminal / observer login
 *   - hud:      in-game overlay
 *   - cctv:     camera grid
 *   - terminal: modal interactable terminal
 *   - pause:    pause screen
 *   - ending:   ending card
 *
 * The UIManager does *not* own game logic. Every button call routes through
 * events so the whole game stays decoupled.
 */
import { $, $$, show, hide, el, typewrite } from "../utils/dom.js";
import { Terminal } from "./Terminal.js";
import { CCTVUI } from "./CCTVUI.js";
import { Boot } from "./Boot.js";
import { MainMenu } from "./MainMenu.js";
import { HUD } from "./HUD.js";

export class UIManager {
  constructor({ events, saveSystem, loopManager, worldState, surveillance, player }) {
    this.events = events;
    this.save = saveSystem;
    this.loop = loopManager;
    this.world = worldState;
    this.surveillance = surveillance;
    this.player = player;

    this.screens = {
      boot:     $("#boot"),
      menu:     $("#main-menu"),
      hud:      $("#hud"),
      cctv:     $("#cctv"),
      terminal: $("#terminal"),
      pause:    $("#pause"),
      ending:   $("#ending"),
    };

    this.boot = new Boot({ node: this.screens.boot, events });
    this.menu = new MainMenu({ node: this.screens.menu, events, save: saveSystem, loop: loopManager, world: worldState });
    this.hud = new HUD({ node: this.screens.hud, events, loop: loopManager, player });
    this.terminal = new Terminal({ node: this.screens.terminal, events, world: worldState, loop: loopManager });
    this.cctv = new CCTVUI({ node: this.screens.cctv, events, surveillance });

    this.currentScreen = null;
    this._bindGlobal();
  }

  _bindGlobal() {
    // Pause menu buttons.
    $$("#pause [data-pause]").forEach((b) => {
      b.addEventListener("click", () => {
        const a = b.getAttribute("data-pause");
        if (a === "resume") this.events.emit("game:resume");
        else if (a === "save") this.save.save();
        else if (a === "menu") this.events.emit("game:toMenu");
      });
    });
    $$("#ending [data-ending]").forEach((b) => {
      b.addEventListener("click", () => this.events.emit("ending:dismiss"));
    });

    // ESC toggles the pause screen while in-game.
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") this.events.emit("ui:escape");
    });
  }

  /** Reveal exactly one screen; hide the others. */
  goto(name) {
    for (const [k, node] of Object.entries(this.screens)) {
      if (!node) continue;
      if (k === name) show(node); else hide(node);
    }
    this.currentScreen = name;
    this.events.emit("ui:screen", { name });
  }

  openTerminal(interactable) { this.terminal.open(interactable); }
  closeTerminal()            { this.terminal.close(); }

  showEnding({ id, title, body }) {
    $("#ending-title").textContent = title;
    $("#ending-body").textContent = body;
    show(this.screens.ending);
  }

  async runBoot(text) { await this.boot.run(text); }

  showLoopReset() {
    const node = $("#loop-reset");
    node.classList.remove("hidden");
    // Trigger re-animation by forcing a reflow.
    void node.offsetWidth;
    node.style.animation = "none";
    void node.offsetWidth;
    node.style.animation = "";
    setTimeout(() => node.classList.add("hidden"), 2400);
  }
}
