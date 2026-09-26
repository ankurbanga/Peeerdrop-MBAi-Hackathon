import { afterEach, describe, expect, it } from "vitest";
import { configured } from "../src/lib/client";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
});

describe("Supabase client configuration", () => {
  it("rejects the checked-in placeholder credentials", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "https://YOUR_PROJECT.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

    expect(configured()).toBe(false);
  });
});
