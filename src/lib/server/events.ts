import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventItem } from "../domain/types";
import { ApiError, checked } from "./db";
import { requireProfile } from "./profiles";
import { matchingInterestTags, snapshotContactNames } from "../domain/logic";

function safeHttps(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function listEvents(
  client: SupabaseClient,
  authId: string,
  forYou = false,
): Promise<EventItem[]> {
  const profile = await requireProfile(client, authId);
  const now = new Date().toISOString();
  const direct = checked(
    await client
      .from("connections")
      .select("person_a,person_b,snapshot_a,snapshot_b")
      .or(`person_a.eq.${profile.id},person_b.eq.${profile.id}`),
  );
  const contactIds = [
    ...new Set(
      (direct as any[]).map((r) =>
        r.person_a === profile.id ? r.person_b : r.person_a,
      ),
    ),
  ];
  const snapshotNames = snapshotContactNames(direct as any[], profile.id);
  const [events, ownInterests, sharedInterests] = await Promise.all([
    checked(
      await client
        .from("events")
        .select("*")
        .gt("starts_at", now)
        .order("starts_at", { ascending: true }),
    ),
    checked(
      await client
        .from("event_interests")
        .select("event_id,share_with_connections")
        .eq("profile_id", profile.id),
    ),
    contactIds.length
      ? checked(
          await client
            .from("event_interests")
            .select("profile_id,event_id")
            .in("profile_id", contactIds)
            .eq("share_with_connections", true),
        )
      : Promise.resolve([]),
  ]);
  const own = new Map<string, boolean>(
    (ownInterests as any[]).map((i) => [
      i.event_id,
      i.share_with_connections === true,
    ]),
  );
  const affiliations = new Set(profile.affiliations.map((a) => a.id));
  const sharedByEvent = new Map<string, Set<string>>();
  for (const row of sharedInterests as any[]) {
    const set = sharedByEvent.get(row.event_id) ?? new Set<string>();
    set.add(row.profile_id);
    sharedByEvent.set(row.event_id, set);
  }
  const output = (events as any[]).map((event: any) => {
    const matchingTags = matchingInterestTags(
      event.tags ?? [],
      profile.details,
    );
    const reasons: string[] = [];
    if (event.affiliation_id && affiliations.has(event.affiliation_id))
      reasons.push("A class or club you selected");
    if (matchingTags.length)
      reasons.push(`Matches your interests: ${matchingTags.join(", ")}`);
    const interestedContacts = [...(sharedByEvent.get(event.id) ?? [])].map(
      (id) => ({ id, displayName: snapshotNames.get(id) ?? "Connection" }),
    );
    const item: EventItem = {
      id: event.id,
      title: event.title,
      starts_at: event.starts_at,
      venue: event.venue,
      external_url: safeHttps(event.external_url),
      source: event.source,
      tags: event.tags ?? [],
      affiliation_id: event.affiliation_id,
      is_demo: event.is_demo === true,
      interested: own.has(event.id),
      shareWithConnections: own.get(event.id) ?? false,
      reasons,
      interestedContacts,
    };
    return item;
  });
  return forYou ? output.filter((e) => e.reasons.length > 0) : output;
}

export async function setEventInterest(
  client: SupabaseClient,
  authId: string,
  eventId: string,
  input: { interested: boolean; shareWithConnections: boolean },
) {
  const profile = await requireProfile(client, authId);
  const event = checked(
    await client.from("events").select("id").eq("id", eventId).maybeSingle(),
  );
  if (!event)
    throw new ApiError(404, "NOT_FOUND", "This event could not be found.");
  if (!input.interested) {
    checked(
      await client
        .from("event_interests")
        .delete()
        .eq("profile_id", profile.id)
        .eq("event_id", eventId),
    );
    return { eventId, interested: false, shareWithConnections: false };
  }
  checked(
    await client.from("event_interests").upsert(
      {
        profile_id: profile.id,
        event_id: eventId,
        share_with_connections: input.shareWithConnections,
      },
      { onConflict: "profile_id,event_id" },
    ),
  );
  return {
    eventId,
    interested: true,
    shareWithConnections: input.shareWithConnections,
  };
}

export async function getCatalog(client: SupabaseClient) {
  const [affiliations, venues] = await Promise.all([
    checked(
      await client
        .from("affiliations")
        .select("id,name,kind")
        .order("kind")
        .order("name"),
    ),
    checked(await client.from("venue_labels").select("label").order("label")),
  ]);
  return {
    affiliations,
    venues: (venues as any[]).map((v) => v.label),
    hobbies: [
      "Board games",
      "Cooking",
      "Cycling",
      "Hiking",
      "Live music",
      "Photography",
      "Running",
      "Soccer",
      "Tennis",
      "Travel",
      "Volunteering",
      "Yoga",
    ],
  };
}
