const clamp = (value) => Math.max(0, Math.min(1, value));

/** Cache layout separately from scroll frames, and stop work outside the visible section. */
export function attachBookingJourneyScroll({
  section,
  viewport,
  header,
  track,
  win,
  doc,
  Observer = win.ResizeObserver,
  VisibilityObserver = win.IntersectionObserver
}) {
  const markers = [...track.querySelectorAll('[data-journey-marker]')];
  const steps = [...track.querySelectorAll('[data-journey-step]')];
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = null;
  let stopped = false;
  let dirty = true;
  let visible = typeof VisibilityObserver !== 'function';
  let geometry;
  let previousProgress;
  let previousActive = -1;

  const measure = () => {
    const positions = markers.map((marker) => marker.getBoundingClientRect());
    let first = positions[0];
    const last = positions[positions.length - 1];
    const vertical = last.top > first.top + 1;
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const viewportHeight = win.innerHeight - headerHeight;
    const viewportStyle = viewport ? win.getComputedStyle(viewport) : null;
    // Measure the content, not the stretched sticky viewport, so resizing can release the pin.
    const contentHeight = viewport
      ? viewport.firstElementChild.offsetHeight +
        parseFloat(viewportStyle.paddingTop) +
        parseFloat(viewportStyle.paddingBottom)
      : Infinity;
    const pinned = !reducedMotion.matches && !vertical && contentHeight <= viewportHeight;
    const scrollDistance = pinned ? Math.max(900, Math.min(1600, win.innerHeight * 1.6)) : 0;
    const sectionTop = viewport ? win.scrollY + section.getBoundingClientRect().top : 0;
    const wasPinned = section.dataset.journeyPinned === 'true';
    section.dataset.journeyPinned = String(pinned);
    section.style.setProperty('--journey-top', `${headerHeight}px`);
    section.style.setProperty('--journey-viewport-height', `${viewportHeight}px`);
    section.style.setProperty('--journey-scroll-distance', `${scrollDistance}px`);

    if (wasPinned && !pinned) first = markers[0].getBoundingClientRect();
    const offsets = positions.map((position) =>
      vertical ? position.top - positions[0].top : position.left - positions[0].left
    );
    const length = offsets[offsets.length - 1];
    geometry = {
      top: pinned ? sectionTop - headerHeight : win.scrollY + first.top + first.height / 2,
      length,
      offsets,
      radius: first.width / 2,
      // Complete the line before the pin ends, leaving time to read step 04 before moving on.
      distance: pinned
        ? scrollDistance * 0.85
        : vertical
          ? length + win.innerHeight * 0.25
          : Math.max(track.offsetHeight, win.innerHeight * 0.55),
      pinned
    };
    track.style.setProperty('--journey-length', `${length}px`);
    track.dataset.journeyDirection = vertical ? 'vertical' : 'horizontal';
    dirty = false;
  };

  const update = () => {
    frame = null;
    if (stopped || doc.hidden) return;
    const measured = dirty || !resizeObserver;
    if (measured) measure();
    const progress =
      reducedMotion.matches || geometry.distance <= 0
        ? 1
        : clamp((win.scrollY + (geometry.pinned ? 0 : win.innerHeight * 0.74) - geometry.top) / geometry.distance);
    const value = progress.toFixed(3);
    if (value !== previousProgress) {
      track.style.setProperty('--journey-progress', value);
      track.dataset.journeyProgress = value;
      previousProgress = value;
    }

    let active = 0;
    geometry.offsets.forEach((offset, index) => {
      if (progress * geometry.length >= offset - geometry.radius) active = index;
    });
    if (active !== previousActive || measured) {
      steps.forEach((step, index) => {
        const state = index < active ? 'complete' : index === active ? 'current' : 'upcoming';
        if (step.dataset.state !== state) step.dataset.state = state;
        const reached = String(index <= active);
        if (markers[index].dataset.reached !== reached) markers[index].dataset.reached = reached;
      });
      previousActive = active;
    }
  };

  const schedule = (force = false) => {
    if (stopped || doc.hidden || frame !== null) return;
    if (!force && (!visible || (reducedMotion.matches && !dirty))) return;
    frame = win.requestAnimationFrame(update);
  };
  const onScroll = () => schedule();
  const resize = () => {
    dirty = true;
    schedule(true);
  };
  const onVisibilityChange = () => {
    if (doc.hidden) {
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
    } else resize();
  };
  const resizeObserver = typeof Observer === 'function' ? new Observer(resize) : null;
  new Set([section, viewport, track, header, doc.body]).forEach(
    (element) => element && resizeObserver?.observe(element)
  );
  const visibilityObserver =
    typeof VisibilityObserver === 'function'
      ? new VisibilityObserver(
          ([entry]) => {
            if (stopped || !entry) return;
            visible = entry.isIntersecting;
            if (visible) resize();
          },
          { rootMargin: '200px 0px', threshold: 0 }
        )
      : null;
  visibilityObserver?.observe(section);
  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', resize);
  reducedMotion.addEventListener('change', resize);
  doc.addEventListener('visibilitychange', onVisibilityChange);
  schedule(true);

  return () => {
    stopped = true;
    if (frame !== null) win.cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    win.removeEventListener('scroll', onScroll);
    win.removeEventListener('resize', resize);
    reducedMotion.removeEventListener('change', resize);
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    delete section.dataset.journeyPinned;
    for (const property of ['--journey-top', '--journey-viewport-height', '--journey-scroll-distance'])
      section.style.removeProperty(property);
  };
}
