import { DataSource } from 'typeorm';

async function runMigration() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DATABASE_URL ? undefined : (process.env.DB_HOST || 'localhost'),
    port: process.env.DATABASE_URL ? undefined : parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DATABASE_URL ? undefined : (process.env.DB_USERNAME || 'admin'),
    password: process.env.DATABASE_URL ? undefined : (process.env.DB_PASSWORD || 'admin_password'),
    database: process.env.DATABASE_URL ? undefined : (process.env.DB_DATABASE || 'licitafacil'),
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    entities: ['src/**/*.entity.ts'],
    migrations: ['src/migrations/*.ts'],
    synchronize: false,
    logging: true,
  });

  try {
    await dataSource.initialize();
    console.log('Data Source initialized');
    
    await dataSource.runMigrations();
    console.log('Migrations completed');
    
    await dataSource.destroy();
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  }
}

runMigration();
