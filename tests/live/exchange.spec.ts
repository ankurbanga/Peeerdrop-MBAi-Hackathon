import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
// No interception: this test requires a configured running app and demo Supabase.
test("two real browser identities exchange, persist and protect their notes", async ({
  browser,
}) => {
  test.skip(
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !process.env.NEXT_PUBLIC_SUPABASE_URL,
    "Requires a disposable configured Supabase project.",
  );
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const profiles: string[] = [],
    authIds: string[] = [];
  async function api(page: Page, path: string, body?: unknown) {
    return page.evaluate(
      async ({ path, body }) => {
        const entry = Object.keys(localStorage).find((k) =>
          k.endsWith("-auth-token"),
        );
        if (!entry) throw new Error("Session missing");
        const session = JSON.parse(localStorage.getItem(entry)!);
        const response = await fetch(`/api${path}`, {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, data: await response.json() };
      },
      { path, body },
    );
  }
  try {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "A hello worth remembering." }),
      ).toBeVisible();
      await page.getByLabel("Display name").fill(`Browser Test ${i}`);
      await page
        .getByRole("textbox", { name: "Previous industry", exact: true })
        .fill("Healthcare");
      await page
        .getByRole("textbox", { name: "Favorite movies", exact: true })
        .fill("Horror movies");
      await page.getByRole("button", { name: "Create my card" }).click();
      await expect(
        page.getByRole("heading", { name: "Your people." }),
      ).toBeVisible();
      const me = (await api(page, "/me")).data;
      profiles.push(me.id);
      authIds.push(me.auth_user_id);
    }
    const [a, b, c] = pages;
    await a
      .getByRole("button", { name: "Peerdrop", exact: true })
      .first()
      .click();
    await a
      .getByRole("checkbox", { name: "Previous industry", exact: true })
      .check();
    await a.getByRole("button", { name: "Create my QR code" }).click();
    await expect(a.getByText("Say hello. Scan. Connect.")).toBeVisible();
    const stored = await a.evaluate(() =>
      JSON.parse(sessionStorage.getItem("peerdrop-active")!),
    );
    await b.goto(stored.url);
    await expect(b.getByText("Browser Test 0 wants to connect")).toBeVisible();
    await b
      .getByRole("checkbox", { name: "Previous industry", exact: true })
      .check();
    await b
      .getByRole("checkbox", { name: "Favorite movies", exact: true })
      .check();
    await b.getByRole("button", { name: "Request exchange" }).click();
    await expect(
      a.getByRole("button", { name: "Yes, exchange cards" }),
    ).toBeVisible();
    const pending = await api(a, `/exchanges/${stored.id}`);
    expect(pending.data.counterpart).not.toHaveProperty("industry");
    await a.getByRole("button", { name: "Yes, exchange cards" }).click();
    await expect(
      a.getByRole("heading", { name: "A hello, remembered." }),
    ).toBeVisible();
    await expect(
      b.getByRole("heading", { name: "A hello, remembered." }),
    ).toBeVisible();
    const accepted = await api(a, `/exchanges/${stored.id}`),
      id = accepted.data.connectionId;
    const privateNote = await api(a, `/connections/${id}/notes`, {
      visibility: "private",
      body: "Secret browser reminder",
    });
    expect(privateNote.status).toBe(201);
    const fromB = await api(b, `/connections/${id}`);
    expect(
      fromB.data.notes.some(
        (n: { body: string }) => n.body === "Secret browser reminder",
      ),
    ).toBe(false);
    expect((await api(c, `/connections/${id}`)).status).toBe(404);
    await a.getByRole("button", { name: "Remember this moment" }).click();
    await a.goto("/");
    await a.reload();
    await a
      .getByRole("textbox", { name: "Search your people" })
      .fill("healthcare horror");
    await expect(
      a.getByRole("button", { name: /Browser Test 1 Healthcare/ }),
    ).toBeVisible();
  } finally {
    if (profiles.length) {
      await admin.from("exchanges").delete().in("initiator_id", profiles);
      await admin.from("exchanges").delete().in("receiver_id", profiles);
      await admin.from("profiles").delete().in("id", profiles);
    }
    for (const id of authIds) await admin.auth.admin.deleteUser(id);
    await Promise.all(contexts.map((c) => c.close()));
  }
});
