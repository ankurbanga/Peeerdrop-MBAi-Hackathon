import { expect, it } from "vitest";
import {
  profileSchema,
  fieldsSchema,
  noteSchema,
  favoriteSchema,
  aiSearchSchema,
} from "../src/lib/domain/validation";
import { shareFields } from "../src/lib/domain/types";
it("rejects arbitrary selectors and excessive notes", () => {
  expect(fieldsSchema.safeParse(["contact"]).success).toBe(false);
  expect(
    noteSchema.safeParse({ visibility: "private", body: "a".repeat(2001) })
      .success,
  ).toBe(false);
});

it("requires a useful, bounded AI people-search question", () => {
  expect(aiSearchSchema.safeParse({ query: "board game guests" }).success).toBe(
    true,
  );
  expect(aiSearchSchema.safeParse({ query: " " }).success).toBe(false);
  expect(aiSearchSchema.safeParse({ query: "a".repeat(501) }).success).toBe(
    false,
  );
});

it("accepts only an explicit favorite state", () => {
  expect(favoriteSchema.safeParse({ favorite: true }).success).toBe(true);
  expect(favoriteSchema.safeParse({ favorite: "yes" }).success).toBe(false);
  expect(
    favoriteSchema.safeParse({ favorite: true, public: true }).success,
  ).toBe(false);
});
it("rejects unsafe social protocols", () => {
  expect(
    profileSchema.safeParse({
      displayName: "Test",
      graduationYear: 2028,
      details: { contact: { instagram: "javascript:alert(1)" } },
      defaultShareFields: [],
      graphVisible: false,
      affiliationIds: [],
    }).success,
  ).toBe(false);
});

it("requires a plausible graduation year", () => {
  const base = {
    displayName: "Test",
    details: {},
    defaultShareFields: [],
    graphVisible: false,
    affiliationIds: [],
  };
  expect(profileSchema.safeParse(base).success).toBe(false);
  expect(
    profileSchema.safeParse({ ...base, graduationYear: 2028 }).success,
  ).toBe(true);
  expect(
    profileSchema.safeParse({ ...base, graduationYear: 2200 }).success,
  ).toBe(false);
});

it("does not accept retired movie or relationship fields", () => {
  expect(shareFields).not.toContain("movies");
  expect(shareFields).not.toContain("relationshipStatus");
  const base = {
    displayName: "Test",
    graduationYear: 2028,
    details: {},
    defaultShareFields: [],
    graphVisible: false,
    affiliationIds: [],
  };
  expect(
    profileSchema.safeParse({ ...base, details: { movies: ["Horror"] } })
      .success,
  ).toBe(false);
});
