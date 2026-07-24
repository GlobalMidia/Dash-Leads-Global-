import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL não está disponível no build da Vercel.");
  }
  console.log("Migrações ignoradas: DATABASE_URL não configurada localmente.");
  process.exit(0);
}

const migrationsDirectory = path.join(process.cwd(), "database", "migrations");
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const client = new Client({ connectionString });

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const fileName of migrationFiles) {
    const migration = await readFile(
      path.join(migrationsDirectory, fileName),
      "utf8",
    );
    const checksum = createHash("sha256").update(migration).digest("hex");
    const {
      rows: [appliedMigration],
    } = await client.query(
      "SELECT checksum FROM schema_migrations WHERE name = $1",
      [fileName],
    );

    if (appliedMigration) {
      if (appliedMigration.checksum !== checksum) {
        throw new Error(
          `A migração ${fileName} foi alterada depois de aplicada.`,
        );
      }
      console.log(`Migração já aplicada: ${fileName}`);
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(migration);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [fileName, checksum],
      );
      await client.query("COMMIT");
      console.log(`Migração aplicada: ${fileName}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
