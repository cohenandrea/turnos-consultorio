/**
 * Aplica las migraciones y carga los datos iniciales si la base está vacía.
 * Se ejecuta automáticamente en cada `npm run build` (también en Vercel).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import {
  seedSettings,
  seedLocations,
  seedConsultationTypes,
  seedCoverages,
  seedTemplates,
} from "../src/db/seed-data";

export async function runMigrations(url: string, opts: { seed?: boolean } = {}) {
  const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false });
  const db = drizzle(sql, { schema });
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
    if (opts.seed !== false) await seed(db);
  } finally {
    await sql.end();
  }
}

async function seed(db: ReturnType<typeof drizzle<typeof schema>>) {
  const existing = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  if (existing.length === 0) {
    await db.insert(schema.settings).values(seedSettings);
    for (const { rules, ...location } of seedLocations) {
      const [loc] = await db.insert(schema.locations).values(location).returning();
      await db.insert(schema.scheduleRules).values(rules.map((r) => ({ ...r, locationId: loc.id })));
    }
    await db.insert(schema.consultationTypes).values(seedConsultationTypes);
    await db.insert(schema.coverages).values(seedCoverages);
    await db.insert(schema.googleIntegration).values({ id: 1 });
    console.log("✓ Datos iniciales cargados");
  }
  // Las plantillas nuevas se agregan sin pisar las editadas
  await db.insert(schema.messageTemplates).values(seedTemplates).onConflictDoNothing();
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    if (process.env.VERCEL) throw new Error("Falta DATABASE_URL en las variables de entorno de Vercel");
    console.warn("⚠ DATABASE_URL no definida: se omiten las migraciones");
    process.exit(0);
  }
  runMigrations(url, { seed: true })
    .then(() => console.log("✓ Base de datos actualizada"))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
