import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observeReveal } from '../src/lib/revealObserver.js';
import { attachHeroDepth, heroDepthValues } from '../src/lib/heroDepth.js';

function observerFixture(options = {}) {
  let observer;
  const values = [];
  const element = {};
  class Observer {
    constructor(callback, config) {
      this.callback = callback;
      this.config = config;
      observer = this;
    }
    observe(target) {
      this.target = target;
    }
    disconnect() {
      this.disconnected = true;
    }
    emit(isIntersecting, intersectionRatio = isIntersecting ? 1 : 0) {
      this.callback([{ target: element, isIntersecting, intersectionRatio }]);
    }
  }
  const stop = observeReveal(element, (value) => values.push(value), { Observer, ...options });
  return { observer, values, element, stop };
}

test('reveal replays on every re-entry from either scroll direction and ignores repeated entries', () => {
  const f = observerFixture();
  assert.equal(f.observer.target, f.element);
  for (let cycle = 0; cycle < 4; cycle++) {
    f.observer.emit(true);
    f.observer.emit(true);
    f.observer.emit(false);
    f.observer.emit(false);
  }
  assert.deepEqual(f.values, [true, false, true, false, true, false, true, false]);
  assert.equal(f.observer.disconnected, undefined);
  f.stop();
});

test('a very small visible slice triggers tall or partially visible content', () => {
  const f = observerFixture();
  f.observer.emit(false);
  f.observer.emit(true, 0.001);
  assert.deepEqual(f.values, [false, true]);
  assert.deepEqual(f.observer.config.threshold, [0]);
  f.stop();
});

test('observer cleanup ignores late callbacks and optional once mode stays completed', () => {
  const f = observerFixture();
  f.stop();
  f.observer.emit(true);
  assert.deepEqual(f.values, []);
  assert.equal(f.observer.disconnected, true);
  const once = observerFixture({ once: true });
  once.observer.emit(true);
  once.observer.emit(false);
  once.observer.emit(true);
  assert.deepEqual(once.values, [true]);
  assert.equal(once.observer.disconnected, true);
});

test('missing or failed observer support falls back to visible content', () => {
  for (const Observer of [
    undefined,
    class {
      constructor() {
        throw new Error('Unavailable');
      }
    },
    class {
      observe() {
        throw new Error('Failed');
      }
      disconnect() {}
    }
  ]) {
    const values = [];
    const stop = observeReveal({}, (value) => values.push(value), { Observer });
    assert.deepEqual(values, [true]);
    stop();
  }
});

test('hero photo and decoration move at different speeds with bounded offsets', () => {
  const values = heroDepthValues(9999, -9999, 999999);
  assert.equal(values['--hero-rx'], '2.5deg');
  assert.equal(values['--hero-ry'], '2.5deg');
  assert.equal(values['--hero-photo-x'], '3px');
  assert.equal(values['--hero-decor-x'], '-7px');
  assert.equal(values['--hero-photo-y'], '3px');
  assert.equal(values['--hero-decor-y'], '14px');
  assert.equal(heroDepthValues(0, 0, 0)['--hero-photo-y'], '0px');
  assert.equal(heroDepthValues(0, 0, 300)['--hero-photo-y'], '6px');
  for (const value of Object.values(heroDepthValues(NaN, Infinity, undefined)))
    assert.doesNotMatch(value, /NaN|Infinity/);
});

class Target {
  listeners = new Map();
  properties = new Map();
  style = {
    setProperty: (name, value) => this.properties.set(name, value),
    removeProperty: (name) => this.properties.delete(name)
  };
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }
  emit(type, fields = {}) {
    for (const fn of this.listeners.get(type) || []) fn(fields);
  }
}

test('hero frames coalesce, scroll resets pointer tilt, hidden tabs pause and cleanup cancels work', () => {
  const host = new Target();
  const surface = new Target();
  const win = new Target();
  const doc = new Target();
  const frames = new Map();
  let next = 0;
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 });
  win.scrollY = 0;
  win.requestAnimationFrame = (fn) => {
    frames.set(++next, fn);
    return next;
  };
  win.cancelAnimationFrame = (id) => frames.delete(id);
  const flush = () => {
    const batch = [...frames.values()];
    frames.clear();
    batch.forEach((fn) => fn());
  };
  const move = () => host.emit('pointermove', { pointerType: 'mouse', buttons: 0, clientX: 400, clientY: 0 });
  const stop = attachHeroDepth({ host, surface, win, doc });
  move();
  move();
  assert.equal(frames.size, 1);
  flush();
  assert.equal(surface.properties.get('--hero-ry'), '2.5deg');
  win.scrollY = 1000;
  win.emit('scroll');
  flush();
  assert.equal(surface.properties.get('--hero-ry'), '0deg');
  assert.equal(surface.properties.get('--hero-photo-y'), '6px');
  move();
  doc.hidden = true;
  doc.emit('visibilitychange');
  assert.equal(frames.size, 0);
  assert.equal(surface.properties.size, 0);
  move();
  assert.equal(frames.size, 0);
  doc.hidden = false;
  doc.emit('visibilitychange');
  const stale = [...frames.values()][0];
  stop();
  stale();
  move();
  assert.equal(frames.size, 0);
  assert.equal(surface.properties.size, 0);
  for (const target of [host, win, doc]) assert.ok([...target.listeners.values()].every((set) => set.size === 0));
});
