import { expect, it } from "vitest";
import {
  profileSchema,
  fieldsSchema,
  noteSchema,
} from "../src/lib/domain/validation";
it("rejects arbitrary selectors and excessive notes", () => {
  expect(fieldsSchema.safeParse(["contact"]).success).toBe(false);
  expect(
    noteSchema.safeParse({ visibility: "private", body: "a".repeat(2001) })
      .success,
  ).toBe(false);
});
it("rejects unsafe social protocols", () => {
  expect(
    profileSchema.safeParse({
      displayName: "Test",
      details: { contact: { instagram: "javascript:alert(1)" } },
      defaultShareFields: [],
      graphVisible: false,
      affiliationIds: [],
    }).success,
  ).toBe(false);
});
