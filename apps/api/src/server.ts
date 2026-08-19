import { buildApp } from './app.js';
import { loadConfig } from './config.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error('CONFIG ERROR - missing or invalid environment variables:', error);
  process.exit(1);
}

const app = await buildApp(config);

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error(error, 'failed to start API');
  process.exit(1);
}
