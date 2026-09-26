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
  networkStats,
  relativeMetTime,
  sanitizeProfileDetails,
  addUniqueTag,
} from "../src/lib/domain/logic";
import type { Profile, Contact } from "../src/lib/domain/types";
const p: Profile = {
  id: "a",
  display_name: "Álex",
  avatar_url: null,
  details: {
    industry: "Healthcare",
    hobbies: ["Board games"],
    contact: { email: "private@example.com" },
  },
  default_share_fields: [],
  graph_visible: false,
  is_demo: false,
  affiliations: [],
  graduation_year: 2028,
};
const c: Contact = {
  connectionId: "c",
  card: {
    id: "b",
    displayName: "Álex",
    avatarUrl: null,
    graduationYear: 2028,
    industry: "Healthcare",
    hobbies: ["Board games"],
  },
  metAt: "2026-09-27T02:00:00Z",
  venue: "Global Hub",
  eventId: null,
  isDemo: false,
  notes: [],
  commonAffiliationIds: [],
  eventIds: [],
  mutualCount: 0,
  favorite: false,
};
describe("sharing and recall", () => {
  it("omits withheld nested and sensitive fields", () => {
    const card = makeCard(p, ["industry"]);
    expect(card).toEqual({
      id: "a",
      displayName: "Álex",
      avatarUrl: null,
      graduationYear: 2028,
      industry: "Healthcare",
    });
  });
  it("matches all normalized fragments across fields", () => {
    expect(matchesContact(c, "alex health board", {})).toBe(true);
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
  it("matches event relevance tags against hobby details", () => {
    expect(
      matchingInterestTags(["horror", "careers"], {
        hobbies: ["Horror movies"],
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

  it("summarizes cohort reach, second-years, and close connections", () => {
    const contacts = [
      { ...c, card: { ...c.card, graduationYear: 2028 }, favorite: true },
      {
        ...c,
        connectionId: "d",
        card: { ...c.card, id: "d", graduationYear: 2027 },
        favorite: false,
      },
      {
        ...c,
        connectionId: "e",
        card: { ...c.card, id: "e", graduationYear: 2029 },
        favorite: true,
      },
    ];
    expect(networkStats(contacts, 2028, 650)).toEqual({
      cohortPercent: 0.2,
      directCount: 3,
      secondYearCount: 1,
      favoriteCount: 2,
    });
  });

  it("describes a meeting relative to now while preserving the exact date elsewhere", () => {
    expect(
      relativeMetTime("2026-09-24T18:00:00Z", new Date("2026-09-26T18:00:00Z")),
    ).toBe("Met 2 days ago");
  });

  it("removes retired profile fields without mutating current details", () => {
    const details = {
      hobbies: ["Board games"],
      movies: ["Horror"],
      relationshipStatus: "Private",
      hometown: "Chicago",
    };
    expect(sanitizeProfileDetails(details)).toEqual({
      hobbies: ["Board games"],
      hometown: "Chicago",
    });
    expect(details.movies).toEqual(["Horror"]);
  });

  it("adds custom hobby bubbles case-insensitively and trims input", () => {
    expect(addUniqueTag(["Board games"], "  Cooking  ")).toEqual([
      "Board games",
      "Cooking",
    ]);
    expect(addUniqueTag(["Board games"], "board GAMES")).toEqual([
      "Board games",
    ]);
  });
});
