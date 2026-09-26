import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Contact,
  Network,
  Note,
  Profile,
  SharedCard,
} from "../domain/types";
import { mutualCounts, visibleEdges } from "../domain/logic";
import { ApiError, checked } from "./db";
import { requireProfile } from "./profiles";

function affiliationIds(profile: Profile) {
  return new Set(profile.affiliations.map((a) => a.id));
}
function commonAffiliations(profile: Profile, card: SharedCard) {
  const own = affiliationIds(profile);
  return [...(card.classes ?? []), ...(card.clubs ?? [])]
    .filter((a) => own.has(a.id))
    .map((a) => a.id);
}
function receivedSnapshot(row: any, profileId: string): SharedCard {
  return (
    row.person_a === profileId ? row.snapshot_b : row.snapshot_a
  ) as SharedCard;
}
function safeNote(note: any): Note {
  return {
    id: note.id,
    author_id: note.author_id,
    visibility: note.visibility,
    body: note.body,
    created_at: note.created_at,
  };
}

async function directConnections(client: SupabaseClient, profileId: string) {
  const rows = checked(
    await client
      .from("connections")
      .select("*")
      .or(`person_a.eq.${profileId},person_b.eq.${profileId}`)
      .order("met_at", { ascending: false })
      .order("id", { ascending: true }),
  );
  return rows ?? [];
}

export async function getNetwork(
  client: SupabaseClient,
  authId: string,
): Promise<Network> {
  const profile = await requireProfile(client, authId);
  const rows = await directConnections(client, profile.id);
  const contactIds = [
    ...new Set(
      rows.map((r: any) =>
        r.person_a === profile.id ? r.person_b : r.person_a,
      ),
    ),
  ];
  const ids = rows.map((r: any) => r.id);
  const [allNotes, interests, contactProfiles] = await Promise.all([
    ids.length
      ? checked(
          await client
            .from("notes")
            .select("*")
            .in("connection_id", ids)
            .order("created_at", { ascending: true }),
        )
      : Promise.resolve([]),
    contactIds.length
      ? checked(
          await client
            .from("event_interests")
            .select("profile_id,event_id,share_with_connections")
            .in("profile_id", contactIds)
            .eq("share_with_connections", true),
        )
      : Promise.resolve([]),
    contactIds.length
      ? checked(
          await client
            .from("profiles")
            .select("id,graph_visible")
            .in("id", contactIds),
        )
      : Promise.resolve([]),
  ]);
  const sharedEventIds = new Map<string, string[]>();
  for (const row of interests as any[])
    sharedEventIds.set(row.profile_id, [
      ...(sharedEventIds.get(row.profile_id) ?? []),
      row.event_id,
    ]);
  const meetingEventIds = rows.map((row: any) => row.event_id).filter(Boolean);
  const authorizedEventIds = [
    ...new Set([
      ...meetingEventIds,
      ...(interests as any[]).map((i) => i.event_id),
    ]),
  ];
  const eventRows = authorizedEventIds.length
    ? checked(
        await client
          .from("events")
          .select("id,title")
          .in("id", authorizedEventIds),
      )
    : [];
  const eventTitles = new Map<string, string>(
    (eventRows as any[]).map((e) => [e.id, e.title]),
  );
  const visible = new Map<string, boolean>(
    (contactProfiles as any[]).map((p) => [p.id, p.graph_visible === true]),
  );
  const contacts: Contact[] = rows.map((row: any) => {
    const otherId = row.person_a === profile.id ? row.person_b : row.person_a;
    const card = receivedSnapshot(row, profile.id);
    const notes = (allNotes as any[])
      .filter(
        (n) =>
          n.connection_id === row.id &&
          (n.visibility === "shared" || n.author_id === profile.id),
      )
      .map(safeNote);
    const eventIds = sharedEventIds.get(otherId) ?? [];
    return {
      connectionId: row.id,
      card,
      metAt: row.met_at,
      venue: row.venue,
      eventId: row.event_id,
      eventTitle: row.event_id ? (eventTitles.get(row.event_id) ?? null) : null,
      eventNames: eventIds
        .map((id) => eventTitles.get(id))
        .filter((name): name is string => Boolean(name)),
      isDemo: row.is_demo === true,
      notes,
      commonAffiliationIds: commonAffiliations(profile, card),
      eventIds,
      mutualCount: 0,
    };
  });
  let relatedEdges: { source: string; target: string }[] = [];
  if (contactIds.length > 1) {
    const related = checked(
      await client
        .from("connections")
        .select("person_a,person_b")
        .in("person_a", contactIds)
        .in("person_b", contactIds),
    );
    for (const row of related as any[]) {
      if (visible.get(row.person_a) && visible.get(row.person_b))
        relatedEdges.push({ source: row.person_a, target: row.person_b });
    }
  }
  const edges = visibleEdges(
    profile.id,
    contactIds,
    relatedEdges,
    Object.fromEntries(visible),
  );
  const counts = mutualCounts(contactIds, edges);
  for (const contact of contacts)
    contact.mutualCount = counts[contact.card.id] ?? 0;
  return {
    self: {
      id: profile.id,
      displayName: profile.display_name,
      avatarUrl: profile.avatar_url,
    },
    contacts,
    edges,
  };
}

export async function getConnectionDetail(
  client: SupabaseClient,
  authId: string,
  connectionId: string,
) {
  const profile = await requireProfile(client, authId);
  const row = checked(
    await client
      .from("connections")
      .select("*")
      .eq("id", connectionId)
      .maybeSingle(),
  );
  if (!row)
    throw new ApiError(404, "NOT_FOUND", "This contact could not be found.");
  if (row.person_a !== profile.id && row.person_b !== profile.id)
    throw new ApiError(404, "NOT_FOUND", "This contact could not be found.");
  const card = receivedSnapshot(row, profile.id);
  const [notes, interests] = await Promise.all([
    checked(
      await client
        .from("notes")
        .select("*")
        .eq("connection_id", connectionId)
        .order("created_at", { ascending: true }),
    ),
    checked(
      await client
        .from("event_interests")
        .select("profile_id,event_id,share_with_connections")
        .in("profile_id", [row.person_a, row.person_b]),
    ),
  ]);
  const otherId = row.person_a === profile.id ? row.person_b : row.person_a;
  const ownEvents = new Set(
    (interests as any[])
      .filter((i) => i.profile_id === profile.id)
      .map((i) => i.event_id),
  );
  const otherShared = new Set(
    (interests as any[])
      .filter((i) => i.profile_id === otherId && i.share_with_connections)
      .map((i) => i.event_id),
  );
  const eventIds = [...ownEvents].filter((id) => otherShared.has(id));
  const authorizedEventIds = [
    ...new Set([...(row.event_id ? [row.event_id] : []), ...eventIds]),
  ];
  const eventRows = authorizedEventIds.length
    ? checked(
        await client
          .from("events")
          .select("id,title")
          .in("id", authorizedEventIds),
      )
    : [];
  const eventTitles = new Map<string, string>(
    (eventRows as any[]).map((e) => [e.id, e.title]),
  );
  return {
    connectionId: row.id,
    card,
    metAt: row.met_at,
    venue: row.venue,
    eventId: row.event_id,
    isDemo: row.is_demo === true,
    eventTitle: row.event_id ? (eventTitles.get(row.event_id) ?? null) : null,
    eventNames: eventIds
      .map((id) => eventTitles.get(id))
      .filter((name): name is string => Boolean(name)),
    notes: (notes as any[])
      .filter((n) => n.visibility === "shared" || n.author_id === profile.id)
      .map(safeNote),
    commonAffiliationIds: commonAffiliations(profile, card),
    eventIds,
    mutualCount: 0,
  };
}

export async function authorizedConnection(
  client: SupabaseClient,
  authId: string,
  connectionId: string,
) {
  const profile = await requireProfile(client, authId);
  const row = checked(
    await client
      .from("connections")
      .select("id,person_a,person_b")
      .eq("id", connectionId)
      .maybeSingle(),
  );
  if (!row || (row.person_a !== profile.id && row.person_b !== profile.id))
    throw new ApiError(404, "NOT_FOUND", "This contact could not be found.");
  return { profile, row };
}
