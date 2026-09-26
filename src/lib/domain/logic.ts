import type {
  Profile,
  ShareField,
  SharedCard,
  Contact,
  Filters,
  Edge,
} from "./types";
export function makeCard(p: Profile, fields: ShareField[]): SharedCard {
  const card: SharedCard = {
    id: p.id,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
  };
  for (const key of fields) {
    if (key === "classes" || key === "clubs") {
      const values = p.affiliations.filter(
        (a) => a.kind === (key === "classes" ? "class" : "club"),
      );
      if (values.length) card[key] = values;
    } else if (["phone", "email", "instagram", "linkedin"].includes(key)) {
      const k = key as keyof NonNullable<Profile["details"]["contact"]>;
      const value = p.details.contact?.[k];
      if (value) card.contact = { ...card.contact, [k]: value };
    } else {
      const value = p.details[key as keyof Profile["details"]];
      if (
        value &&
        (typeof value !== "object" || (Array.isArray(value) && value.length))
      )
        Object.assign(card, { [key]: value });
    }
  }
  return card;
}
export const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function chicagoDay(v: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(v));
}
export function matchesContact(c: Contact, q: string, f: Filters): boolean {
  const values = (o: unknown): string =>
    Array.isArray(o)
      ? o.map(values).join(" ")
      : o && typeof o === "object"
        ? Object.values(o).map(values).join(" ")
        : typeof o === "string"
          ? o
          : "";
  const corpus = normalize(
    values(c.card) +
      " " +
      (c.venue ?? "") +
      " " +
      (c.eventTitle ?? "") +
      " " +
      (c.eventNames ?? []).join(" ") +
      " " +
      c.notes.map((n) => n.body).join(" "),
  );
  if (
    !normalize(q)
      .trim()
      .split(/\s+/)
      .every((t) => corpus.includes(t))
  )
    return false;
  const sets: Record<string, string[]> = {
    class: c.card.classes?.map((a) => a.id) ?? [],
    club: c.card.clubs?.map((a) => a.id) ?? [],
    event: [...c.eventIds, ...(c.eventId ? [c.eventId] : [])],
    hometown: [c.card.hometown ?? ""],
    industry: [c.card.industry ?? ""],
    venue: [c.venue ?? ""],
  };
  for (const [key, options] of Object.entries(sets)) {
    const selected = f[key as keyof Filters];
    if (
      Array.isArray(selected) &&
      selected.length &&
      !selected.some((x) => options.includes(x))
    )
      return false;
  }
  const day = chicagoDay(c.metAt);
  return (!f.from || day >= f.from) && (!f.to || day <= f.to);
}
export function mutualCounts(
  ids: string[],
  edges: Edge[],
): Record<string, number> {
  const direct = new Set(ids),
    counts: Record<string, number> = {};
  for (const edge of edges) {
    if (direct.has(edge.source) && direct.has(edge.target)) {
      counts[edge.source] = (counts[edge.source] ?? 0) + 1;
      counts[edge.target] = (counts[edge.target] ?? 0) + 1;
    }
  }
  return counts;
}
export function matchingInterestTags(
  tags: string[],
  details: { hobbies?: string[]; movies?: string[]; industry?: string },
): string[] {
  const interests = [
    ...(details.hobbies ?? []),
    ...(details.movies ?? []),
    ...(details.industry ? [details.industry] : []),
  ]
    .map(normalize)
    .filter(Boolean);
  return tags.filter((tag) => {
    const value = normalize(tag);
    return (
      Boolean(value) &&
      interests.some(
        (interest) => interest.includes(value) || value.includes(interest),
      )
    );
  });
}
export function snapshotContactNames(
  rows: Array<{
    person_a: string;
    person_b: string;
    snapshot_a?: { displayName?: unknown };
    snapshot_b?: { displayName?: unknown };
  }>,
  profileId: string,
): Map<string, string> {
  return new Map(
    rows.map((row) => {
      const id = row.person_a === profileId ? row.person_b : row.person_a;
      const snapshot =
        row.person_a === profileId ? row.snapshot_b : row.snapshot_a;
      return [
        id,
        typeof snapshot?.displayName === "string"
          ? snapshot.displayName
          : "Connection",
      ];
    }),
  );
}
export function visibleEdges(
  self: string,
  ids: string[],
  edges: Edge[],
  consent: Record<string, boolean>,
): Edge[] {
  const set = new Set(ids);
  return [
    ...ids.map((target) => ({ source: self, target })),
    ...edges.filter(
      (e) =>
        set.has(e.source) &&
        set.has(e.target) &&
        consent[e.source] &&
        consent[e.target],
    ),
  ];
}
export function visibleInterests<
  T extends { profile_id: string; share_with_connections: boolean },
>(ids: string[], interests: T[]): T[] {
  const set = new Set(ids);
  return interests.filter(
    (i) => set.has(i.profile_id) && i.share_with_connections,
  );
}
export function radialPositions(ids: string[]) {
  return ids.map((id, i) => {
    const ring = Math.floor(i / 8),
      count = Math.min(8, ids.length - ring * 8),
      angle = (2 * Math.PI * (i % 8)) / count - Math.PI / 2 + ring * 0.22,
      radius = 195 + ring * 165;
    return {
      id,
      position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
    };
  });
}
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
