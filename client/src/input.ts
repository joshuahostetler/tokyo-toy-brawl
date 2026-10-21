// Keyboard + mouse state with pointer lock for FPS look.

export class Input {
  readonly keys = new Set<string>();
  /** Keys pressed since the last call to `consumePressed`. */
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  leftDown = false;
  /** Left button went down since the last frame (so quick clicks between frames still count). */
  leftClicked = false;
  rightDown = false;
  locked = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        this.lock();
        return;
      }
      if (e.button === 0) this.leftDown = this.leftClicked = true;
      if (e.button === 2) this.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Chrome occasionally reports huge bogus deltas under pointer lock; drop them.
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.reset();
    });
  }

  lock() {
    this.canvas.requestPointerLock();
  }

  down(code: string) {
    return this.keys.has(code);
  }

  /** True once per physical key press. */
  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.leftClicked = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  private reset() {
    this.keys.clear();
    this.leftDown = false;
    this.rightDown = false;
  }
}
