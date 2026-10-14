import { pool } from '../../db.js';
import { businessClock } from '../../lib/time.js';
import { bumpStamp } from '../changes/changes.repo.js';
import { dueRentals } from './inventory.repo.js';
import { checkOutRental } from './inventory.service.js';

export function createRentalCheckoutScheduler({
  clock = businessClock,
  loadDue = (at) => dueRentals(pool, at),
  checkout = (ref, at) => checkOutRental(ref, { name: 'Automatic inventory' }, { automatic: true, clock: at }),
  publish = bumpStamp,
  report = (error) => console.error('[inventory] Automatic checkout failed:', error.message),
  intervalMs = 60000
} = {}) {
  let timer;
  let running;
  let stopped = false;

  async function processDue() {
    const at = clock();
    const refs = await loadDue(at);
    for (const ref of refs) {
      if (stopped) break;
      try {
        const result = await checkout(ref, at);
        if (result.changed) await publish();
      } catch (error) {
        report(error);
      }
    }
  }

  function run() {
    if (stopped) return Promise.resolve();
    if (running) return running;
    running = processDue()
      .catch(report)
      .finally(() => {
        running = undefined;
      });
    return running;
  }

  return {
    run,
    start() {
      if (timer || stopped) return;
      timer = setInterval(() => {
        void run();
      }, intervalMs);
      timer.unref();
      void run();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    }
  };
}
