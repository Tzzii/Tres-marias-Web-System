/** Observe layout wrappers, never the animated surface. Outside the view only resets the animation. */
export function observeReveal(
  element,
  onChange,
  { once = false, threshold = 0, Observer = globalThis.IntersectionObserver } = {}
) {
  if (!element || typeof Observer !== 'function') {
    onChange(true);
    return () => {};
  }
  let stopped = false;
  let observer;
  let visible = null;
  const update = (next) => {
    if (visible === next) return;
    visible = next;
    onChange(next);
  };
  try {
    observer = new Observer(
      ([entry]) => {
        if (stopped || !entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= threshold) {
          update(true);
          if (once) {
            stopped = true;
            observer.disconnect();
          }
        } else if (!entry.isIntersecting) {
          update(false);
        }
      },
      { threshold: [...new Set([0, threshold])] }
    );
    observer.observe(element);
  } catch {
    observer?.disconnect();
    stopped = true;
    update(true);
  }
  return () => {
    stopped = true;
    observer?.disconnect();
  };
}
