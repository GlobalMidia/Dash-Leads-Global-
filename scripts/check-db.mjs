import process from "node:process";
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada.");
}

const sql = neon(process.env.DATABASE_URL);
const migrations = await sql.query(
  "SELECT name FROM schema_migrations ORDER BY name",
);
const tables = await sql.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
);

console.log(
  JSON.stringify({
    migrations: migrations.map((row) => row.name),
    tables: tables.map((row) => row.table_name),
  }),
);
