import { app } from './app.mjs';
import { sequelize } from './db/connection.mjs';
import { eventRepository } from './repositories/eventRepository.mjs';
import { seedDemoData } from './repositories/demoRepository.mjs';
import { env } from './config/env.mjs';
import { createMailSender } from './mail/sender.mjs';
import { createMailWorker } from './services/mailWorker.mjs';
import { initializeDatabase } from './repositories/databaseRepository.mjs';

await initializeDatabase();

// First start on a fresh clone: fill the empty database so the UI has something to show.
if (env.SEED_DEMO === 'true' && (await eventRepository.list()).length === 0) {
  await seedDemoData();
  console.log('Empty database – demo data added');
}

const worker = createMailWorker(createMailSender());
worker.start();
const server = app.listen(env.PORT, '0.0.0.0', () => console.log('Campus Events running on port ' + env.PORT));
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await worker.stop();
    await sequelize.close();
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
