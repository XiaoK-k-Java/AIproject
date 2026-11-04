const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
]);

const BOOST_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight']);

/**
 * Unified 360° input:
 *  - pointer aim on the arena
 *  - draggable radial joystick
 *  - eight-way keyboard aiming
 *  - hold-to-sprint via Space, Shift, or the boost button
 */
export class InputController {
  constructor({
    canvas,
    joystick,
    knob,
    needle,
    boostButton,
    getAimOrigin,
  }) {
    this.canvas = canvas;
    this.joystick = joystick;
    this.knob = knob;
    this.needle = needle;
    this.boostButton = boostButton;
    this.getAimOrigin = getAimOrigin;

    this.enabled = false;
    this.angle = null;
    this.aimMode = 'manual';
    this.pointerPosition = null;
    this.keys = new Set();
    this.keyboardBoost = false;
    this.pointerBoost = false;

    this.joyPointerId = null;
    this.boostPointerId = null;
    this.touchPointerId = null;
    this.lastNeedleAngle = null;

    this.bindEvents();
    this.syncNeedle();
  }

  bindEvents() {
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.enabled) return;
      if (event.pointerType === 'mouse') {
        this.pointerPosition = { x: event.clientX, y: event.clientY };
        this.aimMode = 'pointer';
        this.aimAtPointer();
      } else if (event.pointerType === 'touch' && event.pointerId === this.touchPointerId) {
        this.aimAtScreenPoint(event.clientX, event.clientY);
        this.aimMode = 'pointer';
      }
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      if (event.pointerType === 'touch') {
        this.touchPointerId = event.pointerId;
        this.pointerPosition = { x: event.clientX, y: event.clientY };
        this.aimAtScreenPoint(event.clientX, event.clientY);
        this.aimMode = 'pointer';
      }
    });

    const stopTouch = (event) => {
      if (event.pointerId === this.touchPointerId) this.touchPointerId = null;
    };
    this.canvas.addEventListener('pointerup', stopTouch);
    this.canvas.addEventListener('pointercancel', stopTouch);

    this.canvas.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') this.pointerPosition = null;
    });

    this.joystick.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      event.stopPropagation();
      this.joyPointerId = event.pointerId;
      this.aimMode = 'joystick';
      this.joystick.classList.add('is-active');
      try {
        this.joystick.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is an enhancement, not a requirement.
      }
      this.updateJoystick(event);
    });

    this.joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.joyPointerId) return;
      event.preventDefault();
      event.stopPropagation();
      this.updateJoystick(event);
    });

    const releaseJoystick = (event) => {
      if (event.pointerId !== this.joyPointerId) return;
      this.joyPointerId = null;
      this.joystick.classList.remove('is-active');
      this.setKnob(0, 0);
      this.aimMode = 'joystick';
    };
    this.joystick.addEventListener('pointerup', releaseJoystick);
    this.joystick.addEventListener('pointercancel', releaseJoystick);
    this.joystick.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === this.joyPointerId) releaseJoystick(event);
    });

    this.boostButton.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      event.stopPropagation();
      this.boostPointerId = event.pointerId;
      this.pointerBoost = true;
      this.boostButton.classList.add('is-active');
      try {
        this.boostButton.setPointerCapture(event.pointerId);
      } catch {
        // Ignore.
      }
    });

    const releaseBoost = (event) => {
      if (event.pointerId !== this.boostPointerId) return;
      this.boostPointerId = null;
      this.pointerBoost = false;
      this.boostButton.classList.remove('is-active');
    };
    this.boostButton.addEventListener('pointerup', releaseBoost);
    this.boostButton.addEventListener('pointercancel', releaseBoost);
    this.boostButton.addEventListener('lostpointercapture', (event) => {
      if (event.pointerId === this.boostPointerId) releaseBoost(event);
    });

    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    window.addEventListener('blur', () => this.resetHeldState());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.resetHeldState();
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  onKeyDown(event) {
    if (!this.enabled) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    if (MOVE_KEYS.has(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
      this.updateKeyboardAngle();
      return;
    }

    if (BOOST_KEYS.has(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
      this.keyboardBoost = true;
    }
  }

  onKeyUp(event) {
    if (MOVE_KEYS.has(event.code) || BOOST_KEYS.has(event.code)) {
      if (this.enabled) event.preventDefault();
      this.keys.delete(event.code);
      if (BOOST_KEYS.has(event.code)) {
        this.keyboardBoost = [...this.keys].some((code) => BOOST_KEYS.has(code));
      }
      if (MOVE_KEYS.has(event.code)) this.updateKeyboardAngle(false);
    }
  }

  updateKeyboardAngle(allowEmpty = true) {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const up = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const down = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const dx = (right ? 1 : 0) - (left ? 1 : 0);
    const dy = (down ? 1 : 0) - (up ? 1 : 0);

    if (dx !== 0 || dy !== 0) {
      this.angle = Math.atan2(dy, dx);
      this.aimMode = 'keyboard';
    } else if (!allowEmpty) {
      // Keep the last heading when every direction key is released.
    }
    this.syncNeedle();
  }

  updateJoystick(event) {
    const rect = this.joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = event.clientX - cx;
    let dy = event.clientY - cy;
    const maxRadius = rect.width * 0.285;
    const length = Math.hypot(dx, dy);

    if (length > maxRadius) {
      dx = (dx / length) * maxRadius;
      dy = (dy / length) * maxRadius;
    }

    if (length > 3) {
      this.angle = Math.atan2(dy, dx);
      this.aimMode = 'joystick';
    }

    this.setKnob(dx, dy);
    this.syncNeedle();
  }

  setKnob(x, y) {
    this.knob.style.setProperty('--x', `${x.toFixed(1)}px`);
    this.knob.style.setProperty('--y', `${y.toFixed(1)}px`);
  }

  aimAtPointer() {
    if (!this.pointerPosition) return;
    this.aimAtScreenPoint(this.pointerPosition.x, this.pointerPosition.y);
  }

  aimAtScreenPoint(clientX, clientY) {
    const origin = this.getAimOrigin?.();
    if (!origin) return;
    const dx = clientX - origin.x;
    const dy = clientY - origin.y;
    if (Math.hypot(dx, dy) < 22) return;
    this.angle = Math.atan2(dy, dx);
    this.syncNeedle();
  }

  update() {
    if (!this.enabled) return;

    if (this.aimMode === 'pointer' && this.pointerPosition) {
      this.aimAtPointer();
    }
    this.syncNeedle();
  }

  syncNeedle() {
    if (this.angle == null) {
      this.needle.style.opacity = '0';
      return;
    }
    const degrees = (this.angle * 180) / Math.PI;
    const rounded = Math.round(degrees * 10) / 10;
    if (rounded === this.lastNeedleAngle) return;
    this.lastNeedleAngle = rounded;
    this.needle.style.opacity = '';
    this.needle.style.setProperty('--aim', `${rounded}deg`);
  }

  setAngle(angle) {
    if (!Number.isFinite(angle)) return;
    this.angle = angle;
    this.aimMode = 'manual';
    this.syncNeedle();
  }

  resetAim() {
    this.angle = null;
    this.aimMode = 'manual';
    this.pointerPosition = null;
    this.syncNeedle();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.resetHeldState();
      this.pointerPosition = null;
      this.joystick.classList.remove('is-active');
      this.boostButton.classList.remove('is-active');
      if (this.joyPointerId != null) {
        try {
          this.joystick.releasePointerCapture(this.joyPointerId);
        } catch {
          // Ignore.
        }
        this.joyPointerId = null;
      }
      this.setKnob(0, 0);
    }
  }

  resetHeldState() {
    this.keys.clear();
    this.keyboardBoost = false;
    this.pointerBoost = false;
    this.boostPointerId = null;
    this.boostButton.classList.remove('is-active');
  }

  get boost() {
    return this.enabled && (this.keyboardBoost || this.pointerBoost);
  }

  get state() {
    return {
      angle: this.angle,
      boost: this.boost,
    };
  }
}
