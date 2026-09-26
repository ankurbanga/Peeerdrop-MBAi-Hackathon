import { describe, it, expect } from "vitest";
import {
  makeCard,
  matchesContact,
  visibleEdges,
  radialPositions,
  visibleInterests,
  mutualCounts,
  matchingInterestTags,
  snapshotContactNames,
} from "../src/lib/domain/logic";
import type { Profile, Contact } from "../src/lib/domain/types";
const p: Profile = {
  id: "a",
  display_name: "Álex",
  avatar_url: null,
  details: {
    industry: "Healthcare",
    movies: ["Horror movies"],
    contact: { email: "private@example.com" },
    relationshipStatus: "Private",
  },
  default_share_fields: [],
  graph_visible: false,
  is_demo: false,
  affiliations: [],
};
const c: Contact = {
  connectionId: "c",
  card: {
    id: "b",
    displayName: "Álex",
    avatarUrl: null,
    industry: "Healthcare",
    movies: ["Horror movies"],
  },
  metAt: "2026-09-27T02:00:00Z",
  venue: "Global Hub",
  eventId: null,
  isDemo: false,
  notes: [],
  commonAffiliationIds: [],
  eventIds: [],
  mutualCount: 0,
};
describe("sharing and recall", () => {
  it("omits withheld nested and sensitive fields", () => {
    const card = makeCard(p, ["industry"]);
    expect(card).toEqual({
      id: "a",
      displayName: "Álex",
      avatarUrl: null,
      industry: "Healthcare",
    });
  });
  it("matches all normalized fragments across fields", () => {
    expect(matchesContact(c, "alex health horr", {})).toBe(true);
    expect(matchesContact(c, "health soccer", {})).toBe(false);
  });
  it("searches titles of consented event interests", () => {
    expect(
      matchesContact(
        { ...c, eventTitle: "Fall Healthcare Mixer" },
        "healthcare mixer",
        {},
      ),
    ).toBe(true);
  });
  it("counts only visible contact-to-contact edges as mutuals", () => {
    expect(
      mutualCounts(
        ["a", "b"],
        [
          { source: "me", target: "a" },
          { source: "me", target: "b" },
          { source: "a", target: "b" },
        ],
      ),
    ).toEqual({ a: 1, b: 1 });
  });
  it("matches event relevance tags against movie details", () => {
    expect(
      matchingInterestTags(["horror", "careers"], {
        hobbies: [],
        movies: ["Horror movies"],
        industry: "Healthcare",
      }),
    ).toEqual(["horror"]);
  });
  it("uses the immutable received-card name for interested contacts", () => {
    expect(
      snapshotContactNames(
        [
          {
            person_a: "me",
            person_b: "b",
            snapshot_a: { displayName: "My edited name" },
            snapshot_b: { displayName: "Old snapshot name" },
          },
        ],
        "me",
      ).get("b"),
    ).toBe("Old snapshot name");
  });
  it("ANDs categories, ORs values and uses inclusive Chicago dates", () => {
    expect(
      matchesContact(c, "", {
        industry: ["Finance", "Healthcare"],
        venue: ["Global Hub"],
        from: "2026-09-26",
        to: "2026-09-26",
      }),
    ).toBe(true);
    expect(matchesContact(c, "", { from: "2026-09-27" })).toBe(false);
    expect(matchesContact(c, "", { venue: ["Other"] })).toBe(false);
  });
  it.each([
    [false, false, 0],
    [true, false, 0],
    [false, true, 0],
    [true, true, 1],
  ])("requires both endpoints consent %s %s", (a, b, count) => {
    expect(
      visibleEdges("me", ["a", "b"], [{ source: "a", target: "b" }], {
        a: Boolean(a),
        b: Boolean(b),
      }).length,
    ).toBe(2 + Number(count));
  });
  it("does not expose stranger edges", () => {
    expect(
      visibleEdges("me", ["a"], [{ source: "a", target: "stranger" }], {
        a: true,
        stranger: true,
      }),
    ).toHaveLength(1);
  });
  it("only shares opted-in direct contact event interest", () => {
    expect(
      visibleInterests(
        ["a"],
        [
          { profile_id: "a", share_with_connections: false },
          { profile_id: "b", share_with_connections: true },
        ],
      ),
    ).toEqual([]);
  });
  it("lays out every contact without moving self", () => {
    const positions = radialPositions(
      Array.from({ length: 20 }, (_, i) => String(i)),
    );
    expect(positions).toHaveLength(20);
    expect(positions[0].position).not.toEqual(positions[8].position);
  });
});
