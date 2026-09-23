import http from 'node:http';
import { config } from './config.js'; // first: loads apps/api/.env and sets TZ before anything reads the clock
import { createApp } from './app.js';

/**
 * Start the API: `npm run dev:api` (nodemon) or `npm start -w apps/api`.
 *
 * Uses http.createServer instead of app.listen() because in Express 5 app.listen passes a start-up
 * error (e.g. port in use) to its callback, which would print "ready" for a server that never started.
 * The database is not touched here: the API starts and answers /api/health even without MySQL.
 */
const server = http.createServer(createApp());

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
});

/**
 * Ctrl+C or a stop from the host: stop taking new requests, let the ones in progress finish,
 * then exit. After 5 seconds it exits anyway so a stuck request cannot keep the process alive.
 * A second Ctrl+C exits at once (the handlers run only once).
 */
function shutdown(signal) {
  console.log(`${signal} received, stopping the API…`);
  server.close(() => process.exit(0));
  server.closeIdleConnections(); // keep-alive sockets with no request in flight would otherwise hold close() open
  setTimeout(() => process.exit(0), 5000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
