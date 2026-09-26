import { test, expect, type Page } from "@playwright/test";
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  eid = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  cid = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const affiliation = {
  id: "10000000-0000-4000-8000-000000000001",
  kind: "class",
  name: "Marketing Strategy",
};
const club = {
  id: "10000000-0000-4000-8000-000000000012",
  kind: "club",
  name: "Kellogg Tech Club",
};
const profile = {
  id: a,
  display_name: "Alex Morgan",
  avatar_url: null,
  graduation_year: 2028,
  details: {
    hometown: "Chicago",
    industry: "Consulting",
    hobbies: ["Running"],
  },
  default_share_fields: ["hometown"],
  graph_visible: false,
  is_demo: false,
  affiliations: [affiliation],
};
const names = [
  "Maya Chen",
  "Theo Brooks",
  "Priya Shah",
  "Jamie Park",
  "Elena Rivera",
  "Oliver Reed",
  "Zara Ahmed",
  "Lucas Bennett",
];
const avatarSlugs = [
  "maya-chen",
  "jordan-ellis",
  "priya-nair",
  "leo-martinez",
  "avery-brooks",
  "sam-okafor",
  "riley-kim",
  "noah-patel",
];
const contactFixtures = names.map((displayName, i) => ({
  connectionId: i === 0 ? cid : `connection-${i}`,
  card: {
    id: i === 0 ? b : `person-${i}`,
    displayName,
    avatarUrl: `/avatars/${avatarSlugs[i]}.png`,
    graduationYear: i % 2 === 0 ? 2028 : 2027,
    industry:
      i === 0 ? "Healthcare" : ["Consulting", "Technology", "Finance"][i % 3],
    hometown: "Chicago",
    hobbies: i === 0 ? ["Board games"] : [],
    classes: [affiliation],
  },
  metAt: "2026-09-25T18:00:00Z",
  venue: ["Global Hub", "The Garage", "Lakeshore"][i % 3],
  eventId: null,
  isDemo: true,
  notes: [],
  commonAffiliationIds: [affiliation.id],
  eventIds: [],
  mutualCount: 0,
  favorite: i === 0,
}));
const events = [
  {
    id: eid,
    title: "Healthcare Careers Mixer",
    starts_at: "2026-10-14T23:30:00Z",
    venue: "Global Hub",
    external_url: null,
    source: "curated",
    tags: ["healthcare", "community"],
    affiliation_id: null,
    is_demo: true,
    interested: false,
    shareWithConnections: false,
    reasons: ["Matches your interests"],
    interestedContacts: [],
  },
];
async function mock(page: Page, onboarding = false) {
  let saved = !onboarding;
  const notes: any[] = [];
  const contacts = structuredClone(contactFixtures);
  let state = "open";
  await page.route("https://test.supabase.co/**", (r) =>
    r.fulfill({
      json: {
        access_token: "test-token",
        refresh_token: "test-refresh",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: a,
          aud: "authenticated",
          role: "authenticated",
          is_anonymous: true,
        },
      },
    }),
  );
  await page.route("**/api/**", async (r) => {
    const url = new URL(r.request().url()),
      path = url.pathname,
      method = r.request().method();
    let out: unknown = {};
    if (path === "/api/me") {
      if (method === "PUT") saved = true;
      out = saved ? profile : null;
    } else if (path === "/api/catalog")
      out = {
        affiliations: [affiliation, club],
        venues: ["Global Hub", "The Garage"],
        hobbies: ["Board games", "Cooking", "Running"],
      };
    else if (path === "/api/network")
      out = {
        self: {
          id: a,
          displayName: "Alex Morgan",
          avatarUrl: null,
          graduationYear: 2028,
        },
        contacts,
        edges: contacts
          .map((c) => ({ source: a, target: c.card.id }))
          .concat([{ source: b, target: "person-1" }]),
      };
    else if (path === "/api/search/ai")
      out = {
        matches: [
          {
            connectionId: cid,
            reason: "Maya enjoys board games and is in your close network.",
          },
        ],
        usedFallback: false,
      };
    else if (path === "/api/events") out = events;
    else if (path.endsWith("/interest")) {
      const body = r.request().postDataJSON();
      events[0].interested = body.interested;
      events[0].shareWithConnections = body.shareWithConnections;
      out = {};
    } else if (path === `/api/connections/${cid}`)
      out = { ...contacts[0], notes };
    else if (path === `/api/connections/${cid}/favorite`) {
      contacts[0].favorite = r.request().postDataJSON().favorite;
      out = { favorite: contacts[0].favorite };
    } else if (path.endsWith("/notes")) {
      const body = r.request().postDataJSON();
      notes.push({
        ...body,
        id: "note",
        author_id: a,
        created_at: new Date().toISOString(),
      });
      out = notes.at(-1);
    } else if (path === "/api/exchanges/preview")
      out = {
        id: eid,
        initiator: {
          id: b,
          displayName: "Maya Chen",
          avatarUrl: "/avatars/maya-chen.png",
          graduationYear: 2027,
        },
        venue: "Global Hub",
        status: "open",
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      };
    else if (path === "/api/exchanges/request") {
      state = "requested";
      out = { id: eid, status: state };
    } else if (path === "/api/exchanges" && method === "POST") {
      state = "open";
      out = {
        id: eid,
        url: "https://example.test/exchange#token=" + "x".repeat(43),
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      };
    } else if (path === `/api/exchanges/${eid}`)
      out = {
        id: eid,
        status: state,
        expiresAt: new Date(Date.now() + 900000).toISOString(),
        venue: "Global Hub",
        connectionId: null,
        counterpart:
          state === "requested"
            ? { id: b, displayName: "Maya Chen", avatarUrl: null }
            : null,
        isInitiator: !onboarding,
        ownSnapshot: {
          id: a,
          displayName: "Alex Morgan",
          avatarUrl: null,
          graduationYear: 2028,
        },
      };
    else if (path.endsWith("/cancel")) state = "cancelled";
    await r.fulfill({ json: out });
  });
}
for (const width of [390, 1440])
  test(`network retrieval, notes and event privacy at ${width}px (simulated API)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mock(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your people." }),
    ).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(9);
    await expect(page.locator(".person-node .avatar img")).toHaveCount(8);
    await expect(page.getByText("0.6%", { exact: true })).toBeVisible();
    const closeNetwork = page
      .locator(".quick-filters")
      .getByRole("button", { name: "Close network" });
    await closeNetwork.click();
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await closeNetwork.click();
    await expect(page.locator(".react-flow__node")).toHaveCount(9);
    await page.screenshot({
      path: `test-results/network-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("textbox", { name: "Search your people" })
      .fill("health board");
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await expect(
      page.getByRole("button", { name: /Maya Chen Healthcare/ }),
    ).toBeVisible();
    await expect(page.locator(".contact-row")).toHaveCount(1);
    await page.getByRole("button", { name: /Maya Chen Healthcare/ }).click();
    await expect(
      page.getByRole("button", {
        name: "Remove Maya Chen from close network",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Remove Maya Chen from close network" })
      .click();
    await expect(
      page.getByRole("button", { name: "Add Maya Chen to close network" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Just for you" }),
    ).toBeVisible();
    await page
      .getByLabel("Private reminder")
      .fill("Talked about horror movies");
    await page.getByRole("button", { name: "Save reminder" }).click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("link", { name: "Events", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Healthcare Careers Mixer" }),
    ).toBeVisible();
    if (
      !(await page
        .getByRole("button", { name: "Interested", exact: true })
        .count())
    )
      await page.getByRole("button", { name: "I’m interested" }).click();
    await expect(
      page.getByLabel("Share my interest with connections"),
    ).not.toBeChecked();
    await page.screenshot({
      path: `test-results/events-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("preserves an invite through onboarding and previews identity before request (simulated API)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mock(page, true);
  await page.goto("/exchange#token=" + "x".repeat(43));
  await expect(
    page.getByRole("heading", { name: "Who are you?" }),
  ).toBeVisible();
  await page.getByLabel("Display name").fill("Alex Morgan");
  await page.getByRole("button", { name: "Create my card" }).click();
  await expect(page.getByText("Maya Chen wants to connect")).toBeVisible();
  await expect(page.getByText("Class of 2027")).toBeVisible();
  await expect(page.getByText("Healthcare", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Request exchange" }).click();
  await expect(page.getByText("Waiting for their confirmation…")).toBeVisible();
});
test("QR creation survives closing the sheet and cancellation is recoverable (simulated API)", async ({
  page,
}) => {
  await mock(page);
  let creates = 0;
  let cancels = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/exchanges") && request.method() === "POST")
      creates += 1;
    if (request.url().endsWith("/cancel")) cancels += 1;
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Peerdrop", exact: true })
    .first()
    .click();
  await expect(page.getByText("Say hello. Scan. Connect.")).toBeVisible();
  expect(creates).toBe(1);
  await page.getByRole("button", { name: "Change what I’m sharing" }).click();
  await page.getByRole("checkbox", { name: "Hometown", exact: true }).uncheck();
  await expect.poll(() => creates).toBe(2);
  expect(cancels).toBe(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Peerdrop", exact: true })
    .first()
    .click();
  await expect(page.getByText("Say hello. Scan. Connect.")).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel exchange", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Exchange cancelled" }),
  ).toBeVisible();
});
test("graph contact can be opened using a keyboard (simulated API)", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  const node = page.getByRole("button", {
    name: "Open Maya Chen",
    exact: true,
  });
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "A familiar face" }),
  ).toBeVisible();
});

test("AI search recommends only existing connections with a reason (simulated API)", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Ask Peerdrop" }).click();
  await page
    .getByRole("textbox", { name: "Search your people" })
    .fill("Who should I invite to a board gaming party?");
  const request = page.waitForRequest(
    (item) => item.url().endsWith("/api/search/ai") && item.method() === "POST",
  );
  await page.getByRole("button", { name: "Ask Peerdrop" }).click();
  expect((await request).postDataJSON()).toEqual({
    query: "Who should I invite to a board gaming party?",
  });
  await expect(
    page.getByRole("heading", { name: "Peerdrop suggests" }),
  ).toBeVisible();
  await expect(
    page.getByText("Maya enjoys board games and is in your close network."),
  ).toBeVisible();
  await expect(page.locator(".contact-row")).toHaveCount(1);
});

test("profile selects CampusGroups spaces and suggested/custom hobbies (simulated API)", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/me");
  await expect(page.locator(".directory-identity .avatar img")).toBeVisible();
  const hobbies = page.getByRole("textbox", { name: "Search or add a hobby" });
  await hobbies.fill("Cooking");
  await page.getByRole("button", { name: "+ Cooking" }).click();
  await hobbies.fill("Chess");
  await hobbies.press("Enter");
  const spaces = page.getByRole("textbox", {
    name: "Search CampusGroups spaces",
  });
  await spaces.fill("Tech");
  await page.getByRole("button", { name: "+ Kellogg Tech Club" }).click();
  const save = page.waitForRequest(
    (r) => r.url().endsWith("/api/me") && r.method() === "PUT",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  const body = (await save).postDataJSON();
  expect(body.details.hobbies).toEqual(["Running", "Cooking", "Chess"]);
  expect(body.affiliationIds).toEqual([affiliation.id, club.id]);
});
