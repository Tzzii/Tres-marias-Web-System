export const HERO_DEPTH_MEDIA =
  '(min-width: 900px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

const clamp = (value, limit) => Math.max(-limit, Math.min(limit, Number.isFinite(value) ? value : 0));
const unit = (value, suffix) => `${Math.round(value * 1000) / 1000}${suffix}`;

export function heroDepthValues(x, y, scrollY) {
  x = clamp(x, 1);
  y = clamp(y, 1);
  const scroll = clamp(Math.max(0, scrollY) * 0.02, 6);
  return {
    '--hero-rx': unit(-y * 2.5, 'deg'),
    '--hero-ry': unit(x * 2.5, 'deg'),
    '--hero-photo-x': unit(x * 3, 'px'),
    '--hero-photo-y': unit(y * 3 + scroll, 'px'),
    '--hero-decor-x': unit(-x * 7, 'px'),
    '--hero-decor-y': unit(10 - y * 7 - scroll * 0.5, 'px')
  };
}

/** All movement is scoped to the figure; text, buttons and layout never move. */
export function attachHeroDepth({ host, surface, win, doc }) {
  let x = 0;
  let y = 0;
  let frame = null;
  let stopped = false;
  const clear = () => {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    Object.keys(heroDepthValues(0, 0, 0)).forEach((name) => surface.style.removeProperty(name));
  };
  const schedule = () => {
    if (stopped || doc.hidden || frame !== null) return;
    frame = win.requestAnimationFrame(() => {
      frame = null;
      if (stopped || doc.hidden) return;
      Object.entries(heroDepthValues(x, y, win.scrollY)).forEach(([name, value]) =>
        surface.style.setProperty(name, value)
      );
    });
  };
  const reset = () => {
    x = 0;
    y = 0;
    schedule();
  };
  const move = (event) => {
    if (event.pointerType !== 'mouse' || event.buttons) {
      reset();
      return;
    }
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      reset();
      return;
    }
    x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, 1);
    y = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, 1);
    schedule();
  };
  const keydown = (event) => {
    if (event.key === 'Tab' || event.key === 'Escape') reset();
  };
  const visibility = () => {
    if (doc.hidden) {
      x = 0;
      y = 0;
      clear();
    } else schedule();
  };
  const bindings = [
    [host, 'pointermove', move],
    [host, 'pointerleave', reset],
    [host, 'pointercancel', reset],
    [host, 'pointerdown', reset],
    [win, 'scroll', reset],
    [win, 'resize', reset],
    [win, 'blur', reset],
    [win, 'keydown', keydown],
    [doc, 'visibilitychange', visibility]
  ];
  bindings.forEach(([target, type, listener]) => target.addEventListener(type, listener, { passive: true }));
  schedule();
  return () => {
    stopped = true;
    clear();
    bindings.forEach(([target, type, listener]) => target.removeEventListener(type, listener));
  };
}
