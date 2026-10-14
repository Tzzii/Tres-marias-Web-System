import http from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { createRealtimeServer } from './realtime.js';
import { createRentalCheckoutScheduler } from './modules/inventory/inventory.scheduler.js';

const server = http.createServer(createApp());
const realtime = createRealtimeServer(server);
const rentalCheckout = createRentalCheckoutScheduler();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already in use. Stop the other process or set PORT in apps/api/.env.`);
  } else {
    console.error('The API could not start:', err);
  }
  process.exit(1);
});

server.listen(config.port, () => {
  console.log(`API ready on http://localhost:${config.port}/api/health (${config.env}, ${config.timeZone})`);
  rentalCheckout.start();
});

function shutdown(signal) {
  console.log(`${signal} received, stopping the API…`);
  void Promise.all([rentalCheckout.stop(), realtime.close()]).then(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 5000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
