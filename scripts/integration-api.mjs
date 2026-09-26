// Real Supabase + running app check. Run only against a disposable demo project.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
  app = process.env.NEXT_PUBLIC_APP_URL;
if (!url || !key || !serviceKey || !app) {
  console.error(
    "Set Supabase URL, anon key, service-role key and APP_URL for a disposable demo project.",
  );
  process.exit(1);
}
const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  }),
  users = [];
const actors = [];
async function call(index, path, body, method = body ? "POST" : "GET") {
  const response = await fetch(`${app}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${users[index].token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
try {
  for (let i = 0; i < 3; i++) {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInAnonymously();
    assert.ifError(error);
    users.push({ id: data.user.id, token: data.session.access_token });
    const r = await call(
      i,
      "/me",
      {
        displayName: `Disposable Peer ${i}`,
        details: {
          industry: "Healthcare",
          movies: ["Horror movies"],
          contact: { email: `withheld${i}@example.com` },
        },
        defaultShareFields: [],
        graphVisible: true,
        affiliationIds: [],
      },
      "PUT",
    );
    assert.equal(r.status, 200);
    actors.push(r.data.id);
  }
  const invite = await call(0, "/exchanges", {
    shareFields: ["industry"],
    venue: "Global Hub",
  });
  assert.equal(invite.status, 201);
  const token = new URL(invite.data.url).hash.slice(7),
    id = invite.data.id;
  const preview = await call(1, `/exchanges/preview?token=${token}`);
  assert.equal(preview.status, 200);
  assert.equal(JSON.stringify(preview.data).includes("Healthcare"), false);
  const requests = await Promise.all([
    call(1, "/exchanges/request", {
      token,
      shareFields: ["industry", "movies"],
    }),
    call(1, "/exchanges/request", {
      token,
      shareFields: ["industry", "movies"],
    }),
  ]);
  assert(requests.every((r) => r.status === 201));
  const pending = await call(0, `/exchanges/${id}`);
  assert.equal(pending.data.counterpart.displayName, "Disposable Peer 1");
  assert.equal("industry" in pending.data.counterpart, false);
  const stranger = await call(2, `/exchanges/${id}`);
  assert.equal(stranger.status, 404);
  const results = await Promise.all([
    call(0, `/exchanges/${id}/accept`, {}),
    call(0, `/exchanges/${id}/accept`, {}),
  ]);
  assert(results.every((r) => r.status === 200));
  const connection = results[0].data.connectionId;
  assert.equal(results[1].data.connectionId, connection);
  let detail = await call(0, `/connections/${connection}`);
  assert.equal(detail.data.card.industry, "Healthcare");
  assert.equal("contact" in detail.data.card, false);
  assert.equal((await call(2, `/connections/${connection}`)).status, 404);
  const note = await call(0, `/connections/${connection}/notes`, {
    visibility: "private",
    body: "A private memory",
  });
  assert.equal(note.status, 201);
  detail = await call(1, `/connections/${connection}`);
  assert.equal(
    detail.data.notes.some((n) => n.body === "A private memory"),
    false,
  );
  assert.equal(
    (await call(1, `/notes/${note.data.id}`, { body: "unauthorized" }, "PATCH"))
      .status,
    404,
  );
  assert.equal(
    (await call(2, `/notes/${note.data.id}`, undefined, "DELETE")).status,
    404,
  );
  const shared = await call(0, `/connections/${connection}/notes`, {
    visibility: "shared",
    body: "A shared memory",
  });
  assert.equal(shared.status, 201);
  assert(
    (await call(1, `/connections/${connection}`)).data.notes.some(
      (n) => n.body === "A shared memory",
    ),
  );
  assert.equal(
    (await call(1, `/notes/${shared.data.id}`, undefined, "DELETE")).status,
    404,
  );
  const before = (await call(0, "/network")).data;
  const mutual = before.edges.filter(
    (e) =>
      e.source !== actors[0] &&
      e.target !== actors[0] &&
      (e.source === actors[1] || e.target === actors[1]),
  );
  await call(
    1,
    "/me",
    {
      displayName: "Disposable Peer 1",
      details: { industry: "Healthcare" },
      defaultShareFields: [],
      graphVisible: false,
      affiliationIds: [],
    },
    "PUT",
  );
  const after = (await call(0, "/network")).data;
  assert.equal(
    after.edges.filter(
      (e) =>
        e.source !== actors[0] &&
        e.target !== actors[0] &&
        (e.source === actors[1] || e.target === actors[1]),
    ).length,
    0,
  );
  const events = (await call(0, "/events")).data;
  if (events.length) {
    const eventId = events[0].id;
    await call(
      1,
      `/events/${eventId}/interest`,
      { interested: true, shareWithConnections: false },
      "PUT",
    );
    assert(
      !(await call(0, "/events")).data
        .find((e) => e.id === eventId)
        .interestedContacts.some((p) => p.id === actors[1]),
    );
    await call(
      1,
      `/events/${eventId}/interest`,
      { interested: true, shareWithConnections: true },
      "PUT",
    );
    assert(
      (await call(0, "/events")).data
        .find((e) => e.id === eventId)
        .interestedContacts.some((p) => p.id === actors[1]),
    );
  }
  console.log(
    `Real API checks passed: reciprocal exchange, retries, withheld fields, private/shared notes, third-user access, event consent, graph revocation (${mutual.length} demo edges removed).`,
  );
} finally {
  if (actors.length) {
    await admin.from("exchanges").delete().in("initiator_id", actors);
    await admin.from("exchanges").delete().in("receiver_id", actors);
    await admin.from("profiles").delete().in("id", actors);
  }
  for (const user of users) await admin.auth.admin.deleteUser(user.id);
}
