// Keyboard + mouse input with pointer-lock mouse-look. Owns no game logic —
// systems poll it each frame or read accumulated mouse deltas.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.buttons = [false, false, false];   // left, middle, right
    this.buttonsJust = [false, false, false];
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const c = e.code;
      if (!this.keys.has(c)) this.justPressed.add(c);
      this.keys.add(c);
      // stop browser scrolling / quick-find on gameplay keys
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(c)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button < 3) { this.buttons[e.button] = true; this.buttonsJust[e.button] = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button < 3) this.buttons[e.button] = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked && this.enabled) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() { this.canvas.requestPointerLock?.(); }
  exitLock() { document.exitPointerLock?.(); }

  isDown(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }
  mouseDown(btn) { return this.buttons[btn]; }
  mouseClicked(btn) { return this.buttonsJust[btn]; }

  // call at end of each frame
  endFrame() {
    this.justPressed.clear();
    this.buttonsJust[0] = this.buttonsJust[1] = this.buttonsJust[2] = false;
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }
}
