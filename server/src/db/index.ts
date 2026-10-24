import { Database } from "bun:sqlite";
import { migrations } from "./migrations";

export const openDb = (path: string): Database => {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const row = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
  const current = row?.user_version ?? 0;
  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      db.exec(migrations[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    })();
  }
  return db;
};
