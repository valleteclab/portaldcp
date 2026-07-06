import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * DataSource para o CLI do TypeORM (migration:generate/run/revert).
 * NÃO é usado pela aplicação em runtime — o app usa TypeOrmModule (app.module.ts).
 *
 * Uso (a partir de backend/):
 *   npm run migration:generate -- src/migrations/NomeDaMigration
 *   npm run migration:run
 *   npm run migration:revert
 *
 * As credenciais vêm do mesmo .env do app (DATABASE_URL ou DB_HOST/PORT/...).
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : process.env.DB_HOST || 'localhost',
  port: process.env.DATABASE_URL ? undefined : parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DATABASE_URL ? undefined : process.env.DB_USERNAME || 'admin',
  password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD || 'admin_password',
  database: process.env.DATABASE_URL ? undefined : process.env.DB_DATABASE || 'licitafacil',
  ssl:
    process.env.DB_SSL === 'false'
      ? false
      : process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : false,
  // Entidades por glob para o diff do migration:generate.
  entities: [__dirname + '/**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: true,
});
