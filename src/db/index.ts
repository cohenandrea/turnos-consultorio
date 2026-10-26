import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __db?: DB; __sql?: postgres.Sql };

function create(): DB {
  // DATABASE_URL, o las que crean automáticamente las integraciones de Neon/Supabase en Vercel
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("Falta la variable de entorno DATABASE_URL");
  const sql = postgres(url, {
    max: Number(process.env.DB_POOL_MAX ?? 5),
    // Necesario para el pooler de Supabase/Neon en modo transacción
    prepare: false,
    onnotice: () => {},
  });
  globalForDb.__sql = sql;
  return drizzle(sql, { schema });
}

/** Conexión perezosa: no se conecta hasta el primer uso (permite compilar sin base de datos). */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    if (!globalForDb.__db) globalForDb.__db = create();
    const value = Reflect.get(globalForDb.__db, prop);
    return typeof value === "function" ? value.bind(globalForDb.__db) : value;
  },
});

export async function closeDb() {
  await globalForDb.__sql?.end({ timeout: 5 });
  globalForDb.__db = undefined;
  globalForDb.__sql = undefined;
}

export { schema };
