import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observeReveal } from '../src/lib/revealObserver.js';

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
