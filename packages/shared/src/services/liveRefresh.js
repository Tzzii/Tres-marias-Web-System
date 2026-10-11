/** Coalesce push/recovery bursts and keep at most one calendar refresh in flight. */
export function createLiveRefresh({ loadCalendar, emit, isVisible, delayMs = 250 }) {
  let stopped = false;
  let dirty = false;
  let running = false;
  let timer = null;

  function request() {
    if (stopped) return;
    dirty = true;
    if (running || timer || !isVisible()) return;
    timer = setTimeout(async () => {
      timer = null;
      if (stopped || !isVisible()) return;
      dirty = false;
      running = true;
      try {
        await loadCalendar();
      } catch {
        // Pages still need to refresh if the calendar failed; the next sync retries it.
      } finally {
        running = false;
        if (!stopped) {
          emit();
          if (dirty) request();
        }
      }
    }, delayMs);
  }

  return {
    request,
    stop() {
      stopped = true;
      clearTimeout(timer);
    }
  };
}
