import assert from 'node:assert/strict';
import test from 'node:test';
import { attachBookingJourneyScroll } from '../src/lib/bookingJourneyMotion.js';

class Target {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
}

function fixture({ vertical = false, reduced = false, observers = true, pin = false } = {}) {
  const win = new Target();
  const doc = new Target();
  const motion = new Target();
  motion.matches = reduced;
  win.innerHeight = 1000;
  win.scrollY = 0;
  win.getComputedStyle = () => ({ paddingTop: '80px', paddingBottom: '80px' });
  doc.body = {};
  doc.hidden = false;
  win.matchMedia = () => motion;
  const frames = new Map();
  let serial = 0;
  win.requestAnimationFrame = (callback) => {
    frames.set(++serial, callback);
    return serial;
  };
  win.cancelAnimationFrame = (id) => frames.delete(id);
  let reads = 0;
  const layout = { vertical, offsets: vertical ? [0, 100, 600, 700] : [0, 300, 600, 900] };
  const markers = layout.offsets.map((_, index) => ({
    dataset: {},
    getBoundingClientRect() {
      reads++;
      return {
        top: 1000 - win.scrollY + (layout.vertical ? layout.offsets[index] : 0),
        left: layout.vertical ? 0 : layout.offsets[index],
        width: 64,
        height: 64
      };
    }
  }));
  const steps = markers.map(() => ({ dataset: {} }));
  const writes = [];
  const track = {
    dataset: {},
    offsetHeight: 240,
    querySelectorAll: (selector) => (selector === '[data-journey-marker]' ? markers : steps),
    style: { setProperty: (key, value) => writes.push([key, value]) }
  };
  const properties = new Map();
  const section = {
    dataset: {},
    style: {
      setProperty: (key, value) => properties.set(key, value),
      removeProperty: (key) => properties.delete(key)
    },
    getBoundingClientRect: () => ({ top: 800 - win.scrollY })
  };
  const viewport = { firstElementChild: { offsetHeight: 400 } };
  const header = { getBoundingClientRect: () => ({ height: 84 }) };
  let resizeObserver;
  let visibilityObserver;
  if (observers) {
    win.ResizeObserver = class {
      targets = new Set();
      constructor(callback) {
        this.callback = callback;
        resizeObserver = this;
      }
      observe(element) {
        this.targets.add(element);
      }
      disconnect() {
        this.disconnected = true;
      }
    };
    win.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
        visibilityObserver = this;
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    };
  }
  const stop = attachBookingJourneyScroll({ section, viewport: pin ? viewport : null, header, track, win, doc });
  return {
    win,
    doc,
    motion,
    frames,
    markers,
    steps,
    writes,
    track,
    section,
    viewport,
    properties,
    layout,
    stop,
    resizeObserver,
    visibilityObserver,
    get reads() {
      return reads;
    },
    flush() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
    visible(value = true) {
      visibilityObserver.callback([{ isIntersecting: value }]);
    },
    seek(progress) {
      const pinned = section.dataset.journeyPinned === 'true';
      const distance = pinned
        ? Number.parseFloat(properties.get('--journey-scroll-distance')) * 0.85
        : layout.vertical
          ? layout.offsets.at(-1) + win.innerHeight * 0.25
          : win.innerHeight * 0.55;
      win.scrollY = pinned ? 800 - 84 + distance * progress : 1032 - win.innerHeight * 0.74 + distance * progress;
      win.emit('scroll');
    }
  };
}

test('pinned journeys start at 01, advance through all four steps and reverse with scroll', () => {
  const f = fixture({ pin: true });
  f.flush();
  f.visible();
  f.flush();
  assert.equal(f.section.dataset.journeyPinned, 'true');
  assert.equal(f.properties.get('--journey-top'), '84px');
  assert.equal(f.properties.get('--journey-viewport-height'), '916px');
  assert.equal(f.properties.get('--journey-scroll-distance'), '1600px');
  for (const [progress, active] of [
    [0, 0],
    [1 / 3, 1],
    [2 / 3, 2],
    [1, 3],
    [1.1, 3],
    [2 / 3, 2],
    [0, 0]
  ]) {
    f.seek(progress);
    f.flush();
    assert.equal(
      f.steps.findIndex((step) => step.dataset.state === 'current'),
      active
    );
  }
  assert.equal(f.track.dataset.journeyProgress, '0.000');
  f.stop();
  assert.equal(f.section.dataset.journeyPinned, undefined);
  assert.equal(f.properties.size, 0);
});

test('pinning releases when content no longer fits, layout becomes vertical, or reduced motion is requested', () => {
  const f = fixture({ pin: true });
  f.flush();
  f.visible();
  f.flush();
  f.viewport.firstElementChild.offsetHeight = 900;
  f.resizeObserver.callback();
  f.flush();
  assert.equal(f.section.dataset.journeyPinned, 'false', 'Tall content stays in the normal page flow');
  f.viewport.firstElementChild.offsetHeight = 400;
  f.resizeObserver.callback();
  f.flush();
  assert.equal(f.section.dataset.journeyPinned, 'true');
  f.layout.vertical = true;
  f.resizeObserver.callback();
  f.flush();
  assert.equal(f.section.dataset.journeyPinned, 'false', 'Stacked mobile cards remain readable');
  f.layout.vertical = false;
  f.motion.matches = true;
  f.motion.emit('change');
  f.flush();
  assert.equal(f.section.dataset.journeyPinned, 'false');
  assert.equal(f.track.dataset.journeyProgress, '1.000');
  f.stop();
});

test('journey scroll frames coalesce and reuse layout instead of measuring every frame', () => {
  const f = fixture();
  f.flush();
  f.visible();
  f.flush();
  const reads = f.reads;
  f.seek(0.5);
  f.win.emit('scroll');
  f.win.emit('scroll');
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.track.dataset.journeyProgress, '0.500');
  assert.equal(f.reads, reads);
  assert.deepEqual(
    f.steps.map((step) => step.dataset.state),
    ['complete', 'current', 'upcoming', 'upcoming']
  );
  const writes = f.writes.length;
  f.win.emit('scroll');
  f.flush();
  assert.equal(f.writes.length, writes, 'Unchanged scroll does not rewrite styles');
  f.seek(1);
  f.flush();
  assert.ok(f.markers.every((marker) => marker.dataset.reached === 'true'));
  f.seek(0.1);
  f.flush();
  assert.equal(f.steps[0].dataset.state, 'current');
  assert.equal(f.steps[3].dataset.state, 'upcoming');
  assert.equal(f.reads, reads);
  f.stop();
});

test('vertical journeys follow actual marker spacing and remeasure only when layout changes', () => {
  const f = fixture({ vertical: true });
  f.flush();
  f.visible();
  f.flush();
  f.seek(0.75);
  f.flush();
  assert.equal(f.track.dataset.journeyDirection, 'vertical');
  assert.equal(f.steps[1].dataset.state, 'current', 'A taller step must not activate its successor prematurely');
  f.seek(0.9);
  f.flush();
  assert.equal(f.steps[2].dataset.state, 'current');
  const reads = f.reads;
  f.layout.vertical = false;
  f.layout.offsets = [0, 200, 400, 600];
  f.resizeObserver.callback();
  f.flush();
  assert.equal(f.reads, reads + 4);
  assert.equal(f.track.dataset.journeyDirection, 'horizontal');
  assert.deepEqual(
    f.writes.findLast(([key]) => key === '--journey-length'),
    ['--journey-length', '600px']
  );
  f.stop();
});

test('offscreen and hidden journeys do no scroll work, and cleanup ignores late callbacks', () => {
  const f = fixture();
  f.flush();
  const reads = f.reads;
  for (let i = 0; i < 50; i++) f.seek(i / 50);
  assert.equal(f.frames.size, 0);
  assert.equal(f.reads, reads);
  f.visible();
  f.flush();
  f.seek(0.5);
  f.doc.hidden = true;
  f.doc.emit('visibilitychange');
  assert.equal(f.frames.size, 0);
  f.win.emit('scroll');
  assert.equal(f.frames.size, 0);
  f.doc.hidden = false;
  f.doc.emit('visibilitychange');
  const stale = [...f.frames.values()][0];
  const writes = f.writes.length;
  f.stop();
  stale();
  f.visibilityObserver.callback([{ isIntersecting: true }]);
  f.resizeObserver.callback();
  assert.equal(f.writes.length, writes);
  assert.equal(f.frames.size, 0);
  assert.equal(f.resizeObserver.disconnected, true);
  assert.equal(f.visibilityObserver.disconnected, true);
  for (const target of [f.win, f.doc, f.motion])
    assert.ok([...target.listeners.values()].every((listeners) => listeners.size === 0));
});

test('reduced motion stays complete without scroll frames and responds to preference changes', () => {
  const f = fixture({ reduced: true });
  f.flush();
  f.visible();
  f.flush();
  assert.equal(f.track.dataset.journeyProgress, '1.000');
  assert.equal(f.steps[3].dataset.state, 'current');
  for (let i = 0; i < 20; i++) f.seek(i / 20);
  assert.equal(f.frames.size, 0);
  f.motion.matches = false;
  f.motion.emit('change');
  f.seek(0.5);
  f.flush();
  assert.equal(f.track.dataset.journeyProgress, '0.500');
  f.stop();
});

test('missing observers preserve native scrolling and keep the journey usable', () => {
  const f = fixture({ observers: false });
  f.flush();
  f.seek(0.5);
  f.flush();
  assert.equal(f.track.dataset.journeyProgress, '0.500');
  f.seek(1);
  f.flush();
  assert.equal(f.steps[3].dataset.state, 'current');
  f.stop();
});
