import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  buildAiCandidates,
  fallbackAiSearch,
  validateAiMatches,
} from "../src/lib/domain/ai-search";
import type { Network } from "../src/lib/domain/types";

const network: Network = {
  self: {
    id: "me",
    displayName: "Alex",
    avatarUrl: null,
    graduationYear: 2028,
  },
  contacts: [
    {
      connectionId: "connection-maya",
      card: {
        id: "maya",
        displayName: "Maya Chen",
        avatarUrl: "/maya.png",
        graduationYear: 2028,
        industry: "Healthcare",
        hobbies: ["Board games", "Cooking"],
        contact: { email: "maya@example.com", phone: "555-0100" },
      },
      metAt: "2026-09-20T18:00:00Z",
      venue: "Global Hub",
      eventId: null,
      eventNames: ["Game Night"],
      isDemo: true,
      notes: [
        {
          id: "note",
          author_id: "me",
          visibility: "private",
          body: "Loves cooperative strategy games",
          created_at: "2026-09-20T18:00:00Z",
        },
      ],
      commonAffiliationIds: [],
      eventIds: [],
      mutualCount: 2,
      favorite: true,
    },
  ],
  edges: [],
};

describe("AI people search", () => {
  it("only builds candidates from direct, authorized connection data", () => {
    const [candidate] = buildAiCandidates(network);
    expect(candidate.connectionId).toBe("connection-maya");
    expect(candidate.context).toContain("Board games");
    expect(candidate.context).toContain("cooperative strategy games");
    expect(JSON.stringify(candidate)).not.toContain("maya@example.com");
    expect(JSON.stringify(candidate)).not.toContain("555-0100");
  });

  it("ranks useful deterministic matches when no model is configured", () => {
    expect(
      fallbackAiSearch(
        "Who should I invite to a board gaming party?",
        buildAiCandidates(network),
      ),
    ).toEqual([
      {
        connectionId: "connection-maya",
        reason: "Shares your interest in board games.",
      },
    ]);
  });

  it("drops invented ids, duplicates, and empty model reasons", () => {
    expect(
      validateAiMatches(
        [
          { connectionId: "invented", reason: "Hallucinated" },
          { connectionId: "connection-maya", reason: "  Loves game nights  " },
          { connectionId: "connection-maya", reason: "Duplicate" },
          { connectionId: "other", reason: "" },
        ],
        new Set(["connection-maya", "other"]),
      ),
    ).toEqual([
      { connectionId: "connection-maya", reason: "Loves game nights" },
    ]);
  });

  it("configures default Gemini endpoint and model when GEMINI_API_KEY is provided", async () => {
    const originalEnv = { ...process.env };
    delete process.env.AI_API_KEY;
    delete process.env.AI_API_URL;
    delete process.env.AI_MODEL;
    process.env.GEMINI_API_KEY = "dummy-gemini-key";

    let capturedUrl = "";
    let capturedBody: any = null;
    let capturedHeaders: Record<string, string> = {};

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { connectionId: "connection-maya", reason: "Loves board games" },
                ]),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    try {
      const mockClient = {
        from: (table: string) => {
          if (table === "profiles") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "me", display_name: "Alex", avatar_url: null, graduation_year: 2028 },
                    error: null,
                  }),
                }),
                in: async () => ({
                  data: [{ id: "maya", graph_visible: true }],
                  error: null,
                }),
              }),
            };
          }
          if (table === "connections") {
            return {
              select: () => ({
                or: () => ({
                  order: () => ({
                    order: async () => ({
                      data: [
                        {
                          id: "connection-maya",
                          person_a: "me",
                          person_b: "maya",
                          snapshot_b: { id: "maya", displayName: "Maya Chen" },
                          is_demo: false,
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
                in: () => ({
                  in: async () => ({ data: [], error: null }),
                }),
              }),
            };
          }
          const emptyQuery = () => {
            const chain: any = {
              data: [],
              error: null,
              then: (resolve: any) => resolve({ data: [], error: null }),
            };
            chain.select = () => chain;
            chain.in = () => chain;
            chain.eq = () => chain;
            chain.order = () => chain;
            chain.maybeSingle = async () => ({ data: null, error: null });
            return chain;
          };
          if (table === "notes" || table === "event_interests" || table === "connection_favorites" || table === "events" || table === "profile_affiliations" || table === "affiliations") {
            return emptyQuery();
          }
          return {};
        },
      } as any;

      const { searchPeople } = await import("../src/lib/server/ai-search");
      const res = await searchPeople(mockClient, "me-auth-id", "board games");

      expect(res.usedFallback).toBe(false);
      expect(res.matches).toEqual([
        { connectionId: "connection-maya", reason: "Loves board games" },
      ]);
      expect(capturedUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
      expect(capturedHeaders["Authorization"]).toBe("Bearer dummy-gemini-key");
      expect(capturedBody.model).toBe("gemini-3.8-flash");
    } finally {
      globalThis.fetch = originalFetch;
      process.env = originalEnv;
    }
  });
});
