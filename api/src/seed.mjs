import { seedDemoData } from './repositories/demoRepository.mjs';
import { sequelize } from './db/connection.mjs';
import { initializeDatabase } from './repositories/databaseRepository.mjs';
await initializeDatabase();
await sequelize.sync({ force: true });
await seedDemoData();
console.log('Database reset with demo data.');
await sequelize.close();
