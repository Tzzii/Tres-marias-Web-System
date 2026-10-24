import assert from 'node:assert/strict';
import test from 'node:test';
import { attachHeroTableScroll, heroTablePose, heroTableScrollProgress } from '../src/lib/heroTableMotion.js';

test('the table assembles in order and reversing the scroll returns it to its original state', () => {
  const start = heroTablePose(0);
  assert.equal(start.phase, 0);
  assert.equal(start.chairs, 0);
  assert.ok(start.settings.every((value) => value === 0));
  assert.equal(start.flowers, 0);
  const styled = heroTablePose(0.5);
  assert.equal(styled.phase, 1);
  assert.equal(styled.chairs, 1);
  assert.equal(styled.runner, 1);
  assert.ok(styled.settings.every((value) => value > 0));
  assert.equal(styled.flowers, 0);
  assert.ok(styled.candles.every((value) => value === 0));
  const complete = heroTablePose(1);
  assert.equal(complete.phase, 2);
  assert.ok(complete.settings.every((value) => value === 1));
  assert.equal(complete.flowers, 1);
  assert.ok(complete.candles.every((value) => value === 1));
  assert.ok(complete.rotation > start.rotation);
  assert.deepEqual(heroTablePose(0), start);
  assert.deepEqual(heroTablePose(-100), start);
  assert.deepEqual(heroTablePose(100), complete);
});

test('reduced motion presents the completed table at every scroll position', () => {
  for (const progress of [0, 0.3, 1, NaN, Infinity]) {
    assert.deepEqual(heroTablePose(progress, true), heroTablePose(1));
  }
  for (const progress of [NaN, Infinity, undefined]) {
    assert.ok(Number.isFinite(heroTablePose(progress).rotation));
  }
});

test('native sticky geometry maps to bounded progress and missing travel shows a complete scene', () => {
  assert.equal(heroTableScrollProgress(400, 600, 84), 0);
  assert.equal(heroTableScrollProgress(-216, 600, 84), 0.5);
  assert.equal(heroTableScrollProgress(-516, 600, 84), 1);
  assert.equal(heroTableScrollProgress(-2000, 600, 84), 1);
  for (const distance of [0, -20, NaN, Infinity]) assert.equal(heroTableScrollProgress(0, distance, 84), 1);
});

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

function fixture() {
  const win = new Target(),
    doc = new Target(),
    frames = new Map(),
    values = [];
  let counter = 0,
    desktop = true,
    desktopTop = 84,
    mobileTop = 84,
    observer;
  const viewport = { offsetHeight: 400 };
  const track = { offsetHeight: 900, getBoundingClientRect: () => ({ top: mobileTop }) };
  const desktopTrack = {
    offsetHeight: 1300,
    querySelector: () => ({ offsetHeight: 600 }),
    getBoundingClientRect: () => ({ top: desktopTop })
  };
  win.innerWidth = 1440;
  win.matchMedia = () => ({ matches: desktop });
  win.requestAnimationFrame = (callback) => {
    frames.set(++counter, callback);
    return counter;
  };
  win.cancelAnimationFrame = (id) => frames.delete(id);
  doc.querySelector = () => ({ getBoundingClientRect: () => ({ height: desktop ? 84 : 72 }) });
  class Observer {
    targets = new Set();
    constructor(callback) {
      observer = this;
      this.callback = callback;
    }
    observe(target) {
      this.targets.add(target);
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  const stop = attachHeroTableScroll({
    track,
    viewport,
    desktopTrack,
    draw: (value) => values.push(value),
    win,
    doc,
    Observer
  });
  return {
    win,
    doc,
    frames,
    values,
    stop,
    observer,
    setDesktopTop(value) {
      desktopTop = value;
    },
    mobile(value) {
      desktop = false;
      mobileTop = value;
      win.innerWidth = 390;
    },
    flush() {
      const batch = [...frames.values()];
      frames.clear();
      batch.forEach((callback) => callback());
    }
  };
}

test('scroll frames coalesce, unchanged positions do not render, and mobile uses its own sticky track', () => {
  const f = fixture();
  assert.equal(f.frames.size, 1);
  assert.equal(f.observer.targets.size, 3);
  f.flush();
  assert.deepEqual(f.values, [0]);
  f.setDesktopTop(-266);
  f.win.emit('scroll');
  f.win.emit('scroll');
  f.win.emit('scroll');
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.values.at(-1), 0.5);
  f.win.emit('scroll');
  f.flush();
  assert.equal(f.values.length, 2);
  f.mobile(-166);
  f.win.emit('resize');
  f.flush();
  assert.equal(f.values.at(-1), 0.5);
  assert.equal(f.values.length, 3);
  f.stop();
});

test('hidden pages pause rendering and cleanup cancels work including late callbacks', () => {
  const f = fixture();
  f.doc.hidden = true;
  f.doc.emit('visibilitychange');
  assert.equal(f.frames.size, 0);
  f.win.emit('scroll');
  assert.equal(f.frames.size, 0);
  f.doc.hidden = false;
  f.doc.emit('visibilitychange');
  const stale = [...f.frames.values()][0];
  f.stop();
  stale();
  f.win.emit('scroll');
  assert.deepEqual(f.values, []);
  assert.equal(f.frames.size, 0);
  assert.equal(f.observer.disconnected, true);
  for (const target of [f.win, f.doc])
    assert.ok([...target.listeners.values()].every((listeners) => listeners.size === 0));
});
