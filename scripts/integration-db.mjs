#!/usr/bin/env node

// Transaction checks against a disposable Supabase demo project. This script
// creates only is_demo profiles/exchanges, uses no auth identities, prints no
// credentials or invite tokens, and removes its data in a finally block.

import { createHash, randomBytes, randomUUID } from "node:crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for a disposable Supabase project.",
  );
  process.exit(2);
}

const baseUrl = supabaseUrl.replace(/\/$/, "");
const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};
const actorIds = Array.from({ length: 5 }, () => randomUUID());
const checks = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function request(path, { method = "GET", body, prefer } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers,
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    const error = new Error(
      payload?.message || `Supabase request failed (${response.status})`,
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function insert(table, rows) {
  return request(`/rest/v1/${table}`, {
    method: "POST",
    body: rows,
    prefer: "return=representation",
  });
}

async function rpc(name, args) {
  const result = await request(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body: args,
  });
  return Array.isArray(result) ? result[0] : result;
}

function tokenHash() {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

async function makeExchange(
  initiatorId,
  { expiresAt = new Date(Date.now() + 60_000), venue = "Global Hub" } = {},
) {
  const [row] = await insert("exchanges", {
    token_hash: tokenHash(),
    initiator_id: initiatorId,
    status: "open",
    expires_at: expiresAt.toISOString(),
    initiator_snapshot: {
      id: initiatorId,
      displayName: "Disposable initiator",
      avatarUrl: null,
    },
    venue,
    event_id: "30000000-0000-4000-8000-000000000001",
  });
  return row;
}

async function expectCode(code, operation, label) {
  try {
    await operation();
  } catch (error) {
    const actual = error.payload?.message;
    assert(
      actual === code,
      `${label} should return ${code}; received ${actual || error.message}`,
    );
    checks.push(label);
    return;
  }
  throw new Error(`Assertion failed: ${label} should return ${code}`);
}

async function cleanup() {
  // Delete lifecycle rows before their referenced profiles/connections.
  await request(
    `/rest/v1/exchanges?or=(initiator_id.in.(${actorIds.join(",")}),receiver_id.in.(${actorIds.join(",")}))`,
    { method: "DELETE" },
  );
  await request(`/rest/v1/profiles?id=in.(${actorIds.join(",")})`, {
    method: "DELETE",
  });
}

try {
  await insert(
    "profiles",
    actorIds.map((id, index) => ({
      id,
      display_name: `Disposable Peer ${index + 1}`,
      details: {},
      default_share_fields: [],
      graph_visible: false,
      is_demo: true,
    })),
  );

  // Claiming is atomic and a retry by the same actor preserves the first card.
  const primary = await makeExchange(actorIds[0]);
  const requested = await rpc("request_exchange", {
    p_token_hash: primary.token_hash,
    p_actor: actorIds[1],
    p_snapshot: {
      id: actorIds[1],
      displayName: "Receiver card",
      avatarUrl: null,
      hometown: "Evanston",
    },
  });
  assert(
    requested.status === "requested" && requested.receiver_id === actorIds[1],
    "first receiver request claims invite",
  );
  const repeated = await rpc("request_exchange", {
    p_token_hash: primary.token_hash,
    p_actor: actorIds[1],
    p_snapshot: {
      id: actorIds[1],
      displayName: "Changed retry",
      avatarUrl: null,
    },
  });
  assert(
    repeated.receiver_snapshot.displayName === "Receiver card",
    "repeat request keeps original snapshot",
  );
  checks.push("repeat request is idempotent");
  await expectCode(
    "CONFLICT",
    () =>
      rpc("request_exchange", {
        p_token_hash: primary.token_hash,
        p_actor: actorIds[2],
        p_snapshot: {
          id: actorIds[2],
          displayName: "Competing receiver",
          avatarUrl: null,
        },
      }),
    "different receiver cannot claim invite",
  );
  await expectCode(
    "CONFLICT",
    () =>
      rpc("request_exchange", {
        p_token_hash: primary.token_hash,
        p_actor: actorIds[0],
        p_snapshot: { id: actorIds[0], displayName: "Self", avatarUrl: null },
      }),
    "self exchange is rejected",
  );

  // Acceptance creates a canonical pair, and a retry after expiry returns the
  // same accepted exchange and connection id.
  const accepted = await rpc("accept_exchange", {
    p_exchange_id: primary.id,
    p_actor: actorIds[0],
  });
  assert(
    accepted.status === "accepted" && accepted.connection_id,
    "accept creates a connection",
  );
  const [originalConnection] = await request(
    `/rest/v1/connections?id=eq.${accepted.connection_id}&select=*`,
  );
  assert(
    originalConnection.person_a < originalConnection.person_b,
    "connection pair is canonically ordered",
  );
  assert(
    originalConnection.snapshot_a.id === originalConnection.person_a,
    "snapshot A matches canonical person A",
  );
  assert(
    originalConnection.snapshot_b.id === originalConnection.person_b,
    "snapshot B matches canonical person B",
  );
  await request(`/rest/v1/exchanges?id=eq.${primary.id}`, {
    method: "PATCH",
    body: { expires_at: new Date(Date.now() - 60_000).toISOString() },
    prefer: "return=minimal",
  });
  const acceptedAgain = await rpc("accept_exchange", {
    p_exchange_id: primary.id,
    p_actor: actorIds[0],
  });
  assert(
    acceptedAgain.connection_id === accepted.connection_id,
    "accepted retry returns the stored connection after expiry",
  );
  checks.push("accept is idempotent after expiry");

  // A second invite for this pair reuses the first connection without replacing
  // its snapshots or meeting context.
  const duplicate = await makeExchange(actorIds[1]);
  await rpc("request_exchange", {
    p_token_hash: duplicate.token_hash,
    p_actor: actorIds[0],
    p_snapshot: { id: actorIds[0], displayName: "Later card", avatarUrl: null },
  });
  const duplicateAccepted = await rpc("accept_exchange", {
    p_exchange_id: duplicate.id,
    p_actor: actorIds[1],
  });
  assert(
    duplicateAccepted.connection_id === accepted.connection_id,
    "existing pair reuses connection",
  );
  const [unchangedConnection] = await request(
    `/rest/v1/connections?id=eq.${accepted.connection_id}&select=*`,
  );
  assert(
    unchangedConnection.snapshot_a.displayName ===
      originalConnection.snapshot_a.displayName,
    "existing snapshots stay unchanged",
  );
  checks.push("existing connection is preserved");

  const expired = await makeExchange(actorIds[0], {
    expiresAt: new Date(Date.now() - 60_000),
  });
  await expectCode(
    "EXPIRED",
    () =>
      rpc("request_exchange", {
        p_token_hash: expired.token_hash,
        p_actor: actorIds[1],
        p_snapshot: {
          id: actorIds[1],
          displayName: "Expired receiver",
          avatarUrl: null,
        },
      }),
    "expired invite cannot be claimed",
  );

  const cancelled = await makeExchange(actorIds[0]);
  await rpc("request_exchange", {
    p_token_hash: cancelled.token_hash,
    p_actor: actorIds[1],
    p_snapshot: {
      id: actorIds[1],
      displayName: "Cancelable receiver",
      avatarUrl: null,
    },
  });
  const cancelledRow = await rpc("cancel_exchange", {
    p_exchange_id: cancelled.id,
    p_actor: actorIds[1],
  });
  assert(
    cancelledRow.status === "cancelled",
    "receiver can cancel before acceptance",
  );
  await expectCode(
    "CONFLICT",
    () =>
      rpc("accept_exchange", {
        p_exchange_id: cancelled.id,
        p_actor: actorIds[0],
      }),
    "cancelled exchange cannot be accepted",
  );

  // Race accept against cancel on a separate invite. Exactly one transition
  // wins because both RPCs lock the same exchange row.
  const racing = await makeExchange(actorIds[2]);
  await rpc("request_exchange", {
    p_token_hash: racing.token_hash,
    p_actor: actorIds[3],
    p_snapshot: {
      id: actorIds[3],
      displayName: "Racing receiver",
      avatarUrl: null,
    },
  });
  const outcomes = await Promise.allSettled([
    rpc("accept_exchange", { p_exchange_id: racing.id, p_actor: actorIds[2] }),
    rpc("cancel_exchange", { p_exchange_id: racing.id, p_actor: actorIds[3] }),
  ]);
  const [finalRaceRow] = await request(
    `/rest/v1/exchanges?id=eq.${racing.id}&select=*`,
  );
  assert(
    ["accepted", "cancelled"].includes(finalRaceRow.status),
    "race resolves to a terminal state",
  );
  assert(
    outcomes.some((outcome) => outcome.status === "fulfilled"),
    "race has a committed winning transition",
  );
  if (finalRaceRow.status === "accepted")
    assert(finalRaceRow.connection_id, "accepted race has a connection");
  else
    assert(
      finalRaceRow.connection_id === null,
      "cancelled race has no connection",
    );
  checks.push(`accept/cancel race resolves as ${finalRaceRow.status}`);

  // The PostgREST schema cache may return a table row, but never print it: it
  // can contain user-provided snapshot fields in projects using real fixtures.
  console.log(
    `Database integration checks passed (${checks.length}): ${checks.join(", ")}`,
  );
} catch (error) {
  console.error(`Database integration checks failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error(`Disposable-record cleanup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
