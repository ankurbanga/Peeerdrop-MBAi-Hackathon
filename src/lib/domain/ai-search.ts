import type { AiSearchMatch, Contact, Network } from "./types";

export type AiSearchCandidate = {
  connectionId: string;
  name: string;
  context: string;
  signals: string[];
};

const stopWords = new Set([
  "a",
  "an",
  "and",
  "for",
  "i",
  "invite",
  "my",
  "next",
  "party",
  "people",
  "should",
  "the",
  "to",
  "who",
]);

function words(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !stopWords.has(word));
}

function contactContext(contact: Contact) {
  const card = contact.card;
  return [
    card.graduationYear ? `Class of ${card.graduationYear}` : "",
    card.hometown ? `Hometown: ${card.hometown}` : "",
    card.industry ? `Industry: ${card.industry}` : "",
    card.hobbies?.length ? `Hobbies: ${card.hobbies.join(", ")}` : "",
    card.funFact ? `Fun fact: ${card.funFact}` : "",
    card.classes?.length
      ? `Classes: ${card.classes.map((item) => item.name).join(", ")}`
      : "",
    card.clubs?.length
      ? `Clubs: ${card.clubs.map((item) => item.name).join(", ")}`
      : "",
    contact.venue ? `Met at: ${contact.venue}` : "",
    contact.eventTitle ? `Meeting event: ${contact.eventTitle}` : "",
    contact.eventNames?.length
      ? `Shared events: ${contact.eventNames.join(", ")}`
      : "",
    contact.notes.length
      ? `Your memories: ${contact.notes.map((note) => note.body).join("; ")}`
      : "",
    contact.favorite ? "Close network" : "",
    contact.mutualCount ? `${contact.mutualCount} mutual connections` : "",
  ]
    .filter(Boolean)
    .join(". ");
}

export function buildAiCandidates(network: Network): AiSearchCandidate[] {
  return network.contacts.map((contact) => ({
    connectionId: contact.connectionId,
    name: contact.card.displayName,
    context: contactContext(contact),
    signals: [
      ...(contact.card.hobbies ?? []),
      contact.card.industry,
      contact.card.hometown,
      ...(contact.card.classes?.map((item) => item.name) ?? []),
      ...(contact.card.clubs?.map((item) => item.name) ?? []),
      contact.venue,
      contact.eventTitle,
      ...(contact.eventNames ?? []),
    ].filter((value): value is string => Boolean(value)),
  }));
}

export function validateAiMatches(
  value: unknown,
  allowedIds: Set<string>,
): AiSearchMatch[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const connectionId = Reflect.get(item, "connectionId"),
      reason = Reflect.get(item, "reason");
    if (
      typeof connectionId !== "string" ||
      typeof reason !== "string" ||
      !allowedIds.has(connectionId) ||
      seen.has(connectionId) ||
      !reason.trim()
    )
      return [];
    seen.add(connectionId);
    return [{ connectionId, reason: reason.trim().slice(0, 240) }];
  });
}

export function fallbackAiSearch(
  query: string,
  candidates: AiSearchCandidate[],
): AiSearchMatch[] {
  const queryWords = new Set(words(query));
  return candidates
    .map((candidate) => {
      const contextWords = new Set(
        words(`${candidate.name} ${candidate.context}`),
      );
      const overlap = [...queryWords].filter((word) =>
        [...contextWords].some(
          (contextWord) =>
            contextWord === word ||
            contextWord.startsWith(word) ||
            word.startsWith(contextWord),
        ),
      );
      const signal = candidate.signals.find((value) => {
        const signalWords = words(value);
        return signalWords.some((signalWord) =>
          [...queryWords].some(
            (queryWord) =>
              signalWord === queryWord ||
              signalWord.startsWith(queryWord.slice(0, 4)) ||
              queryWord.startsWith(signalWord.slice(0, 4)),
          ),
        );
      });
      return { candidate, overlap, signal };
    })
    .filter(({ overlap }) => overlap.length)
    .sort((a, b) => b.overlap.length - a.overlap.length)
    .slice(0, 6)
    .map(({ candidate, overlap, signal }) => ({
      connectionId: candidate.connectionId,
      reason: signal
        ? `Shares your interest in ${signal.toLocaleLowerCase()}.`
        : `Matches ${overlap.slice(0, 2).join(" and ")} from your search.`,
    }));
}
