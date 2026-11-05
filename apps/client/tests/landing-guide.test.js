import test from 'node:test';
import assert from 'node:assert/strict';
import { attachLandingGuide } from '../src/lib/landingGuide.js';

function fixture({ y = 0, height = 800, pageHeight = 3800 } = {}) {
  const events = new Map();
  const frames = new Map();
  const changes = [];
  let observer;
  let nextFrame = 0;
  const win = {
    scrollY: y,
    innerHeight: height,
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name)
  };
  const doc = {
    hidden: false,
    documentElement: { scrollHeight: pageHeight },
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name)
  };
  const sections = [
    ['welcome', 0],
    ['packages', 900],
    ['gallery', 1800],
    ['services', 2500],
    ['contact', 3400]
  ].map(([id, top]) => ({ id, getBoundingClientRect: () => ({ top: top - win.scrollY }) }));
  class Observer {
    constructor(callback) {
      this.callback = callback;
      observer = this;
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  const flush = () => {
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback();
    }
  };
  const stop = attachLandingGuide({ sections, onChange: (state) => changes.push(state), win, doc, Observer });
  flush();
  return {
    win,
    doc,
    events,
    frames,
    changes,
    observer,
    stop,
    flush,
    scroll(y) {
      win.scrollY = y;
      events.get('scroll')?.();
      flush();
    }
  };
}

test('the guide follows the section being read, including skipped sections and reverse scrolling', () => {
  const f = fixture();
  assert.equal(f.changes.at(-1)?.section, 'welcome');
  f.scroll(700);
  assert.equal(f.changes.at(-1).section, 'packages');
  f.scroll(2300);
  assert.equal(f.changes.at(-1).section, 'services');
  f.scroll(1600);
  assert.equal(f.changes.at(-1).section, 'gallery');
  f.scroll(0);
  assert.equal(f.changes.at(-1).section, 'welcome');
  f.stop();
});

test('the header hides on downward scrolling and returns upward without reacting to small jitters', () => {
  const f = fixture();
  assert.equal(f.changes.at(-1)?.navHidden, false);
  f.scroll(70);
  assert.equal(f.changes.at(-1).navHidden, false);
  f.scroll(130);
  assert.equal(f.changes.at(-1).navHidden, true);
  const count = f.changes.length;
  f.scroll(127);
  f.scroll(129);
  assert.equal(f.changes.length, count);
  f.scroll(110);
  assert.equal(f.changes.at(-1).navHidden, false);
  f.scroll(-5);
  assert.equal(f.changes.at(-1).navHidden, false);
  f.stop();
});

test('restored positions and the page bottom select the visible content on the first update', () => {
  const restored = fixture({ y: 1600 });
  assert.deepEqual(restored.changes.at(-1), { section: 'gallery', navHidden: true });
  restored.stop();
  const bottom = fixture({ y: 3000 });
  assert.equal(bottom.changes.at(-1).section, 'contact');
  bottom.stop();
});

test('scroll work is coalesced, layout changes refresh the guide, and cleanup stops late work', () => {
  const f = fixture();
  f.win.scrollY = 1600;
  f.events.get('scroll')();
  f.events.get('scroll')();
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.changes.at(-1)?.section, 'gallery');
  f.doc.hidden = true;
  f.win.scrollY = 2300;
  f.events.get('scroll')();
  f.flush();
  assert.equal(f.changes.at(-1).section, 'gallery');
  f.doc.hidden = false;
  f.events.get('visibilitychange')();
  f.flush();
  assert.equal(f.changes.at(-1).section, 'services');
  f.win.scrollY = 1600;
  f.observer.callback();
  f.flush();
  assert.equal(f.changes.at(-1).section, 'gallery');
  f.events.get('scroll')();
  const count = f.changes.length;
  f.stop();
  f.observer.callback();
  f.flush();
  assert.equal(f.changes.length, count);
  assert.equal(f.observer.disconnected, true);
  assert.equal(f.frames.size, 0);
  assert.equal(f.events.size, 0);
});
