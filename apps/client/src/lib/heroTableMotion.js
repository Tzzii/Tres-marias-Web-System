export const HERO_TABLE_DESKTOP = '(min-width: 900px) and (min-height: 680px)';
export const HERO_TABLE_SCROLL_MEDIA = `@media ${HERO_TABLE_DESKTOP} and (prefers-reduced-motion: no-preference)`;

const clamp = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

/** Page position drives the setup in both scroll directions. */
export function heroTablePose(progress, reducedMotion = false) {
  const p = reducedMotion ? 1 : clamp(progress);
  return {
    progress: p,
    phase: p < 0.28 ? 0 : p < 0.68 ? 1 : 2,
    rotation: -0.23 + (p * 52 * Math.PI) / 180,
    chairs: ease((p - 0.025) / 0.23),
    runner: ease((p - 0.1) / 0.2),
    settings: Array.from({ length: 6 }, (_, i) => ease((p - 0.23 - i * 0.024) / 0.2)),
    flowers: ease((p - 0.54) / 0.23),
    candles: [ease((p - 0.64) / 0.18), ease((p - 0.685) / 0.18)]
  };
}

export function heroTableScrollProgress(top, distance, stickyTop = 0) {
  if (!Number.isFinite(distance) || distance <= 0) return 1;
  return clamp((stickyTop - top) / distance);
}

/** Coalesces events, stops in hidden tabs, and never intercepts native scrolling. */
export function attachHeroTableScroll({
  track,
  viewport,
  desktopTrack,
  draw,
  win,
  doc,
  Observer = win.ResizeObserver
}) {
  let frame = null;
  let stopped = false;
  let force = true;
  let previous = -1;
  const update = () => {
    frame = null;
    if (stopped || doc.hidden) return;
    const desktop = win.matchMedia(HERO_TABLE_DESKTOP).matches;
    const target = desktop ? desktopTrack : track;
    const panel = desktop ? desktopTrack.querySelector('[data-hero-panel]') : viewport;
    const header = doc.querySelector('.MuiAppBar-root');
    const stickyTop =
      (header?.getBoundingClientRect().height || (win.innerWidth >= 1200 ? 84 : 72)) + (desktop ? 0 : 12);
    const progress = heroTableScrollProgress(
      target.getBoundingClientRect().top,
      target.offsetHeight - panel.offsetHeight,
      stickyTop
    );
    if (force || Math.abs(progress - previous) > 0.0001) {
      force = false;
      previous = progress;
      draw(progress);
    }
  };
  const schedule = () => {
    if (stopped || doc.hidden || frame !== null) return;
    frame = win.requestAnimationFrame(update);
  };
  const resize = () => {
    force = true;
    schedule();
  };
  const visibility = () => {
    if (doc.hidden) {
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
    } else resize();
  };
  const observer = Observer ? new Observer(resize) : null;
  new Set([track, viewport, desktopTrack]).forEach((element) => observer?.observe(element));
  win.addEventListener('scroll', schedule, { passive: true });
  win.addEventListener('resize', resize);
  doc.addEventListener('visibilitychange', visibility);
  schedule();
  return () => {
    stopped = true;
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
    observer?.disconnect();
    win.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', resize);
    doc.removeEventListener('visibilitychange', visibility);
  };
}
