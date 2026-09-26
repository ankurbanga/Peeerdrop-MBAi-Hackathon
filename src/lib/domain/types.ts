export const shareFields = [
  "hometown",
  "industry",
  "hobbies",
  "funFact",
  "phone",
  "email",
  "instagram",
  "linkedin",
  "classes",
  "clubs",
] as const;
export type ShareField = (typeof shareFields)[number];
export type Affiliation = { id: string; name: string; kind: "class" | "club" };
export type Details = {
  hometown?: string;
  industry?: string;
  hobbies?: string[];
  funFact?: string;
  contact?: {
    phone?: string;
    email?: string;
    instagram?: string;
    linkedin?: string;
  };
};
export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  graduation_year: number;
  details: Details;
  default_share_fields: ShareField[];
  graph_visible: boolean;
  is_demo: boolean;
  affiliations: Affiliation[];
};
export type SharedCard = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  graduationYear?: number;
  hometown?: string;
  industry?: string;
  hobbies?: string[];
  funFact?: string;
  contact?: Details["contact"];
  classes?: Affiliation[];
  clubs?: Affiliation[];
};
export type Note = {
  id: string;
  author_id: string;
  visibility: "private" | "shared";
  body: string;
  created_at: string;
};
export type Contact = {
  connectionId: string;
  card: SharedCard;
  metAt: string;
  venue: string | null;
  eventId: string | null;
  eventTitle?: string | null;
  eventNames?: string[];
  isDemo: boolean;
  notes: Note[];
  commonAffiliationIds: string[];
  eventIds: string[];
  mutualCount: number;
  favorite: boolean;
};
export type Edge = { source: string; target: string };
export type Network = { self: SharedCard; contacts: Contact[]; edges: Edge[] };
export type AiSearchMatch = { connectionId: string; reason: string };
export type AiSearchResponse = {
  matches: AiSearchMatch[];
  usedFallback: boolean;
};
export type Filters = {
  favorite?: boolean;
  class?: string[];
  club?: string[];
  event?: string[];
  hometown?: string[];
  industry?: string[];
  venue?: string[];
  from?: string;
  to?: string;
};
export type EventItem = {
  id: string;
  title: string;
  starts_at: string;
  venue: string;
  external_url: string | null;
  source: string;
  tags: string[];
  affiliation_id: string | null;
  is_demo: boolean;
  interested: boolean;
  shareWithConnections: boolean;
  reasons: string[];
  interestedContacts: { id: string; displayName: string }[];
};
export type ExchangeState = {
  id: string;
  status: "open" | "requested" | "accepted" | "cancelled";
  expiresAt: string;
  venue: string | null;
  connectionId: string | null;
  counterpart: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  isInitiator: boolean;
  ownSnapshot: SharedCard;
};
