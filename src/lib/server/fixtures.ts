import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, SharedCard } from "../domain/types";
import { makeCard } from "../domain/logic";
import { checked } from "./db";

const people = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    name: "Maya Chen",
    industry: "Healthcare",
    hometown: "Seattle, WA",
    hobbies: ["trail running", "cooking"],
    movies: ["Horror movies"],
    funFact: "Has visited 18 national parks",
    classId: "10000000-0000-4000-8000-000000000001",
    clubId: "10000000-0000-4000-8000-000000000011",
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    name: "Jordan Ellis",
    industry: "Technology",
    hometown: "Austin, TX",
    hobbies: ["live music", "cycling"],
    movies: ["Documentaries"],
    funFact: "Makes a playlist for every trip",
    classId: "10000000-0000-4000-8000-000000000002",
    clubId: "10000000-0000-4000-8000-000000000012",
  },
  {
    id: "40000000-0000-4000-8000-000000000003",
    name: "Priya Nair",
    industry: "Consumer goods",
    hometown: "Boston, MA",
    hobbies: ["baking", "tennis"],
    movies: ["Comedy"],
    funFact: "Can solve a Rubik’s cube",
    classId: "10000000-0000-4000-8000-000000000003",
    clubId: "10000000-0000-4000-8000-000000000013",
  },
  {
    id: "40000000-0000-4000-8000-000000000004",
    name: "Leo Martinez",
    industry: "Consulting",
    hometown: "Chicago, IL",
    hobbies: ["basketball", "photography"],
    movies: ["Science fiction"],
    funFact: "Grew up bilingual",
    classId: "10000000-0000-4000-8000-000000000001",
    clubId: "10000000-0000-4000-8000-000000000012",
  },
  {
    id: "40000000-0000-4000-8000-000000000005",
    name: "Avery Brooks",
    industry: "Education",
    hometown: "Atlanta, GA",
    hobbies: ["gardening", "jazz"],
    movies: ["Thrillers"],
    funFact: "Keeps a tiny herb garden",
    classId: "10000000-0000-4000-8000-000000000002",
    clubId: "10000000-0000-4000-8000-000000000013",
  },
  {
    id: "40000000-0000-4000-8000-000000000006",
    name: "Sam Okafor",
    industry: "Finance",
    hometown: "London, UK",
    hobbies: ["soccer", "board games"],
    movies: ["Action"],
    funFact: "Has lived in three countries",
    classId: "10000000-0000-4000-8000-000000000003",
    clubId: "10000000-0000-4000-8000-000000000011",
  },
  {
    id: "40000000-0000-4000-8000-000000000007",
    name: "Riley Kim",
    industry: "Design",
    hometown: "Portland, OR",
    hobbies: ["hiking", "illustration"],
    movies: ["Animation"],
    funFact: "Draws a postcard from each city",
    classId: "10000000-0000-4000-8000-000000000001",
    clubId: "10000000-0000-4000-8000-000000000013",
  },
  {
    id: "40000000-0000-4000-8000-000000000008",
    name: "Noah Patel",
    industry: "Healthcare",
    hometown: "New York, NY",
    hobbies: ["volunteering", "coffee"],
    movies: ["Mystery"],
    funFact: "Collects neighborhood café stamps",
    classId: "10000000-0000-4000-8000-000000000002",
    clubId: "10000000-0000-4000-8000-000000000011",
  },
];

function card(person: (typeof people)[number]): SharedCard {
  return {
    id: person.id,
    displayName: person.name,
    avatarUrl: null,
    industry: person.industry,
    hometown: person.hometown,
    hobbies: person.hobbies,
    movies: person.movies,
    funFact: person.funFact,
    classes: [
      {
        id: person.classId,
        name: person.classId.endsWith("0001")
          ? "Marketing Strategy"
          : person.classId.endsWith("0002")
            ? "Data Analytics"
            : "Entrepreneurship Lab",
        kind: "class",
      },
    ],
    clubs: [
      {
        id: person.clubId,
        name: person.clubId.endsWith("0011")
          ? "Healthcare Club"
          : person.clubId.endsWith("0012")
            ? "Kellogg Tech Club"
            : "Running Club",
        kind: "club",
      },
    ],
  };
}

export async function ensureDemoFixtures(
  client: SupabaseClient,
  profile: Profile,
) {
  if (process.env.DEMO_MODE !== "true") return;
  const now = new Date().toISOString();
  checked(
    await client.from("profiles").upsert(
      people.map((p) => ({
        id: p.id,
        display_name: p.name,
        avatar_url: null,
        details: {
          industry: p.industry,
          hometown: p.hometown,
          hobbies: p.hobbies,
          movies: p.movies,
          funFact: p.funFact,
        },
        default_share_fields: [
          "industry",
          "hometown",
          "hobbies",
          "movies",
          "funFact",
          "classes",
          "clubs",
        ],
        graph_visible: true,
        is_demo: true,
      })),
      { onConflict: "id", ignoreDuplicates: true },
    ),
  );
  const affiliations = people.flatMap((p) => [
    { profile_id: p.id, affiliation_id: p.classId },
    { profile_id: p.id, affiliation_id: p.clubId },
  ]);
  checked(
    await client
      .from("profile_affiliations")
      .upsert(affiliations, {
        onConflict: "profile_id,affiliation_id",
        ignoreDuplicates: true,
      }),
  );
  const ownCard = makeCard(profile, profile.default_share_fields);
  const links = people.map((person) => {
    const sample = card(person);
    const viewerIsA = profile.id < person.id;
    return {
      person_a: viewerIsA ? profile.id : person.id,
      person_b: viewerIsA ? person.id : profile.id,
      snapshot_a: viewerIsA ? ownCard : sample,
      snapshot_b: viewerIsA ? sample : ownCard,
      met_at: now,
      venue: "Global Hub",
      event_id: null,
      is_demo: true,
    };
  });
  checked(
    await client
      .from("connections")
      .upsert(links, {
        onConflict: "person_a,person_b",
        ignoreDuplicates: true,
      }),
  );
}
