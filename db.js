import { neon } from "@neondatabase/serverless";

let database;

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("La variable de entorno DATABASE_URL no está configurada.");
  }

  if (!database) database = neon(connectionString);
  return database;
}
