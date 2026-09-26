import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("upgrades an existing profile/connection schema with cohort and favorites", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table profiles (id uuid primary key, display_name text not null);
      create table connections (id uuid primary key);
    `);
    await db.exec(
      readFileSync("supabase/migrations/002_network_identity.sql", "utf8"),
    );
    const columns = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name='profiles'",
    );
    expect(columns.rows.map((row) => row.column_name)).toContain(
      "graduation_year",
    );
    const table = await db.query<{ name: string | null }>(
      "select to_regclass('public.connection_favorites')::text as name",
    );
    expect(table.rows[0].name).toBe("connection_favorites");
  } finally {
    await db.close();
  }
});
