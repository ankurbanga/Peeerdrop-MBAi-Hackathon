import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
const db = new PGlite();
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const snapshot = (id: string) =>
  JSON.stringify({
    id,
    displayName: id === a ? "Alex" : "Sam",
    avatarUrl: null,
  });
beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  const sql = readFileSync(
    "supabase/migrations/001_peerdrop.sql",
    "utf8",
  ).replace(
    "create extension if not exists pgcrypto with schema extensions;",
    "",
  );
  await db.exec(sql);
  for (const id of [a, b, c])
    await db.query(
      "insert into profiles(id,display_name,is_demo) values($1,$2,true)",
      [id, id],
    );
});
afterAll(async () => {
  await db.close();
});
async function invite(expired = false) {
  const hash = crypto.randomUUID().replaceAll("-", "");
  const r = await db.query<{ id: string }>(
    "insert into exchanges(token_hash,initiator_id,initiator_snapshot,expires_at) values($1,$2,$3,now()+$4::interval) returning id",
    [hash, a, snapshot(a), expired ? "-1 minute" : "15 minutes"],
  );
  return { id: r.rows[0].id, hash };
}
it("loads schema, blocks client tables and client RPC execution", async () => {
  const r = await db.query<{ ok: boolean }>(
    "select has_table_privilege('authenticated','profiles','select') as ok",
  );
  expect(r.rows[0].ok).toBe(false);
  const f = await db.query<{ ok: boolean }>(
    "select has_function_privilege('authenticated','accept_exchange(uuid,uuid)','execute') as ok",
  );
  expect(f.rows[0].ok).toBe(false);
});
it("rejects an unrelated actor cancelling an unclaimed invite", async () => {
  const e = await invite();
  await expect(
    db.query("select * from cancel_exchange($1,$2)", [e.id, c]),
  ).rejects.toThrow("FORBIDDEN");
});
it("requests and accepts idempotently with canonical snapshots and immutable pair", async () => {
  const e = await invite();
  await db.query("select * from request_exchange($1,$2,$3)", [
    e.hash,
    b,
    snapshot(b),
  ]);
  await expect(
    db.query("select * from request_exchange($1,$2,$3)", [
      e.hash,
      c,
      snapshot(c),
    ]),
  ).rejects.toThrow("CONFLICT");
  const accepted = await db.query<{ connection_id: string }>(
    "select * from accept_exchange($1,$2)",
    [e.id, a],
  );
  const repeated = await db.query<{ connection_id: string }>(
    "select * from accept_exchange($1,$2)",
    [e.id, a],
  );
  expect(repeated.rows[0].connection_id).toBe(accepted.rows[0].connection_id);
  const row = await db.query<{
    snapshot_a: { id: string };
    snapshot_b: { id: string };
  }>("select * from connections where id=$1", [accepted.rows[0].connection_id]);
  expect(row.rows[0].snapshot_a.id).toBe(a);
  expect(row.rows[0].snapshot_b.id).toBe(b);
  await expect(
    db.query("update connections set snapshot_a=$1 where id=$2", [
      snapshot(c),
      accepted.rows[0].connection_id,
    ]),
  ).rejects.toThrow("CONFLICT");
});
it("rejects expiry, self exchange and cancellation before acceptance", async () => {
  const expired = await invite(true);
  await expect(
    db.query("select * from request_exchange($1,$2,$3)", [
      expired.hash,
      b,
      snapshot(b),
    ]),
  ).rejects.toThrow("EXPIRED");
  const e = await invite();
  await expect(
    db.query("select * from request_exchange($1,$2,$3)", [
      e.hash,
      a,
      snapshot(a),
    ]),
  ).rejects.toThrow("CONFLICT");
  await db.query("select * from request_exchange($1,$2,$3)", [
    e.hash,
    b,
    snapshot(b),
  ]);
  await db.query("select * from cancel_exchange($1,$2)", [e.id, b]);
  await expect(
    db.query("select * from accept_exchange($1,$2)", [e.id, a]),
  ).rejects.toThrow("CONFLICT");
});
