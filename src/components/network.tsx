"use client";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  useReactFlow,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Search,
  SlidersHorizontal,
  List,
  Network as NetworkIcon,
  Maximize,
  LocateFixed,
  ArrowUpRight,
  MapPin,
  Users,
  X,
  Heart,
  UserRoundCheck,
  GraduationCap,
  Sparkles,
} from "lucide-react";
import type {
  Network as NetworkData,
  Filters,
  Contact,
  AiSearchResponse,
} from "@/lib/domain/types";
import {
  matchesContact,
  radialPositions,
  relativeMetTime,
  networkStats,
} from "@/lib/domain/logic";
import { useResource } from "./use-resource";
import { useSession } from "./session";
import { Avatar, Sheet, ErrorMessage, Loading, Check } from "./ui";
import { PersonDetail } from "./person-detail";
import { send } from "@/lib/client";
const nodeTypes = { person: PersonNode };
const COHORT_SIZE = 650;
function PersonNode({ data }: NodeProps) {
  return (
    <button
      type="button"
      aria-label={data.self ? "You" : `Open ${String(data.name)}`}
      onClick={() => {
        if (typeof data.onOpen === "function") data.onOpen();
      }}
      className={`person-node ${data.self ? "self-node" : ""} ${data.faded ? "faded" : ""}`}
    >
      <Handle type="target" position={Position.Top} />
      <Avatar
        name={String(data.name)}
        src={typeof data.avatar === "string" ? data.avatar : null}
        self={Boolean(data.self)}
      />
      <span>{data.self ? "You" : String(data.name).split(" ")[0]}</span>
      <Handle type="source" position={Position.Bottom} />
    </button>
  );
}
function Graph({
  network,
  matches,
  onSelect,
}: {
  network: NetworkData;
  matches: Set<string>;
  onSelect: (id: string) => void;
}) {
  const flow = useReactFlow();
  const contactKey = network.contacts
    .map((contact) => contact.card.id)
    .join(",");
  const positions = useMemo(
    () => radialPositions(network.contacts.map((c) => c.card.id)),
    [contactKey],
  );
  const nodes = [
    {
      id: network.self.id,
      type: "person",
      position: { x: 0, y: 0 },
      data: {
        name: network.self.displayName,
        avatar: network.self.avatarUrl,
        self: true,
      },
      ariaLabel: "You",
    },
    ...network.contacts.map((c, i) => ({
      ...positions[i],
      type: "person",
      data: {
        name: c.card.displayName,
        avatar: c.card.avatarUrl,
        faded: !matches.has(c.connectionId),
        onOpen: () => onSelect(c.connectionId),
      },
      ariaLabel: `Open ${c.card.displayName}`,
    })),
  ];
  const fit = useCallback(
    () =>
      flow.fitView({
        nodes: [
          { id: network.self.id },
          ...network.contacts.slice(0, 12).map((c) => ({ id: c.card.id })),
        ],
        padding: 0.28,
        maxZoom: 1.05,
      }),
    [flow, network.self.id, contactKey],
  );
  useEffect(() => {
    const timer = setTimeout(fit, 80);
    return () => clearTimeout(timer);
  }, [fit]);
  const matchIds = new Set(
    network.contacts
      .filter((c) => matches.has(c.connectionId))
      .map((c) => c.card.id),
  );
  return (
    <div className="graph-canvas">
      <ReactFlow
        nodes={nodes}
        edges={network.edges.map((e, i) => ({
          id: String(i),
          ...e,
          type: "straight",
          style: {
            stroke: e.source === network.self.id ? "#d5cedd" : "#b6a0d3",
            strokeWidth: e.source === network.self.id ? 1.1 : 1.4,
            opacity: (
              e.source === network.self.id
                ? matchIds.has(e.target)
                : matchIds.has(e.source) && matchIds.has(e.target)
            )
              ? 1
              : 0.12,
            strokeDasharray: e.source === network.self.id ? undefined : "4 5",
          },
        }))}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        nodesFocusable={false}
        edgesFocusable={false}
        minZoom={0.2}
        maxZoom={1.8}
        onNodeClick={(_, n) => {
          const c = network.contacts.find((c) => c.card.id === n.id);
          if (c) onSelect(c.connectionId);
        }}
        onNodeDoubleClick={(_, n) =>
          flow.setCenter(n.position.x, n.position.y, {
            zoom: 1.2,
            duration: 200,
          })
        }
        fitView
      />
      <div className="graph-tools">
        <button onClick={() => flow.fitView({ padding: 0.2 })}>
          <Maximize size={17} />
          Fit everyone
        </button>
        <button aria-label="Recenter on you" onClick={fit}>
          <LocateFixed size={19} />
        </button>
      </div>
      <div className="graph-legend">
        <span />
        <small>Your connection</small>
        <span className="dashed" />
        <small>Mutual connection</small>
      </div>
    </div>
  );
}
function ContactRow({
  contact: c,
  onClick,
  reason,
}: {
  contact: Contact;
  onClick: () => void;
  reason?: string;
}) {
  return (
    <button className="contact-row" onClick={onClick}>
      <Avatar name={c.card.displayName} src={c.card.avatarUrl} />
      <span className="contact-row-text">
        <strong>{c.card.displayName}</strong>
        <span>{c.card.industry ?? c.card.hometown ?? "A new connection"}</span>
        <small>
          {c.venue ?? "Your first hello"} · {relativeMetTime(c.metAt)}
        </small>
        {reason && <small className="ai-match-reason">{reason}</small>}
      </span>
      <ArrowUpRight size={17} />
    </button>
  );
}
export function NetworkScreen() {
  const { data, error, reload } = useResource<NetworkData>("/network"),
    { catalog } = useSession();
  const [query, setQuery] = useState(""),
    [filters, setFilters] = useState<Filters>({}),
    [filterOpen, setFilterOpen] = useState(false),
    [list, setList] = useState(false),
    [person, setPerson] = useState<string | null>(null),
    [aiMode, setAiMode] = useState(false),
    [aiResult, setAiResult] = useState<AiSearchResponse | null>(null),
    [aiBusy, setAiBusy] = useState(false),
    [aiError, setAiError] = useState("");
  useEffect(() => {
    const p = new URLSearchParams(location.search).get("person");
    if (p) setPerson(p);
  }, []);
  const matches = useMemo(() => {
    if (!data) return [];
    if (aiMode && aiResult) {
      const byId = new Map(data.contacts.map((c) => [c.connectionId, c]));
      return aiResult.matches
        .map((match) => byId.get(match.connectionId))
        .filter((contact): contact is Contact => Boolean(contact))
        .filter((contact) => matchesContact(contact, "", filters));
    }
    return data.contacts.filter((c) =>
      matchesContact(c, aiMode ? "" : query, filters),
    );
  }, [aiMode, aiResult, data, query, filters]);
  const filterCount = Object.values(filters).filter((v) =>
      Array.isArray(v) ? v.length : Boolean(v),
    ).length,
    active = Boolean((aiMode ? aiResult : query.trim()) || filterCount);
  const aiReasons = new Map(
    aiResult?.matches.map((match) => [match.connectionId, match.reason]) ?? [],
  );
  const stats = data
    ? networkStats(data.contacts, data.self.graduationYear ?? 2028, COHORT_SIZE)
    : null;
  const displayedNetwork = useMemo<NetworkData | null>(() => {
    if (!data) return null;
    const contacts = active ? matches : data.contacts;
    const visibleIds = new Set(contacts.map((contact) => contact.card.id));
    return {
      ...data,
      contacts,
      edges: data.edges.filter((edge) =>
        edge.source === data.self.id
          ? visibleIds.has(edge.target)
          : visibleIds.has(edge.source) && visibleIds.has(edge.target),
      ),
    };
  }, [data, active, matches]);
  const events = useResource<{ id: string; title: string }[]>("/events", 0);
  function closePerson() {
    setPerson(null);
    if (location.search) history.replaceState(null, "", "/");
    void reload();
  }
  async function askPeerdrop() {
    if (!aiMode) {
      setAiMode(true);
      setQuery("");
      setAiResult(null);
      setAiError("");
      return;
    }
    if (query.trim().length < 2 || aiBusy) return;
    setAiBusy(true);
    setAiError("");
    try {
      setAiResult(
        await send<AiSearchResponse>("/search/ai", { query: query.trim() }),
      );
    } catch (requestError) {
      setAiError((requestError as Error).message);
    } finally {
      setAiBusy(false);
    }
  }
  return (
    <div className="network-page">
      <header className="network-heading">
        <div>
          <h1>
            Your people<span className="heading-dot">.</span>
          </h1>
          <p>Every hello has a story. Keep yours close.</p>
        </div>
        <span className="connection-total">
          <Users size={17} />
          {data?.contacts.length ?? "—"} connections
        </span>
      </header>
      <div className="network-stats" aria-label="Your network snapshot">
        <div>
          <strong>{stats ? `${stats.cohortPercent}%` : "—"}</strong>
          <span>of your cohort</span>
        </div>
        <div>
          <UserRoundCheck size={17} />
          <strong>{stats?.directCount ?? "—"}</strong>
          <span>first-degree</span>
        </div>
        <div>
          <GraduationCap size={18} />
          <strong>{stats?.secondYearCount ?? "—"}</strong>
          <span>second-years</span>
        </div>
        <button
          className={filters.favorite ? "selected" : ""}
          aria-pressed={Boolean(filters.favorite)}
          onClick={() =>
            setFilters((current) => ({
              ...current,
              favorite: !current.favorite,
            }))
          }
        >
          <Heart size={17} fill={filters.favorite ? "currentColor" : "none"} />
          <strong>{stats?.favoriteCount ?? "—"}</strong>
          <span>close network</span>
        </button>
      </div>
      <div className="search-toolbar">
        <div className="search-input">
          {aiMode ? <Sparkles size={20} /> : <Search size={20} />}
          <input
            aria-label="Search your people"
            placeholder={
              aiMode
                ? "Who should I invite to a board gaming party?"
                : "Name, hobby, industry, anything…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && aiMode) void askPeerdrop();
            }}
          />
          {query && (
            <button
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setAiResult(null);
              }}
            >
              <X size={17} />
            </button>
          )}
        </div>
        <button
          className={`ai-search-button ${aiMode ? "selected" : ""}`}
          disabled={aiBusy || (aiMode && query.trim().length < 2)}
          onClick={() => void askPeerdrop()}
        >
          <Sparkles size={17} />
          {aiBusy ? "Thinking…" : "Ask Peerdrop"}
        </button>
        <button
          aria-label="Filters"
          className={`filter-button ${filterCount ? "selected" : ""}`}
          onClick={() => setFilterOpen(true)}
        >
          <SlidersHorizontal size={18} />
          <span>Filters{filterCount ? ` · ${filterCount}` : ""}</span>
        </button>
        <button
          className={`view-toggle ${list ? "selected" : ""}`}
          aria-label={list ? "Show network" : "Show list"}
          onClick={() => setList(!list)}
        >
          {list ? <NetworkIcon size={19} /> : <List size={19} />}
        </button>
      </div>
      {aiMode && (
        <div className="ai-search-note">
          <span>
            Ask naturally. Peerdrop only considers people and details already
            shared with you.
          </span>
          <button
            className="text-button"
            onClick={() => {
              setAiMode(false);
              setAiResult(null);
              setAiError("");
              setQuery("");
            }}
          >
            Back to regular search
          </button>
        </div>
      )}
      {aiError && <ErrorMessage error={aiError} retry={askPeerdrop} />}
      <div className="quick-filters">
        <button
          className={!active ? "selected" : ""}
          onClick={() => {
            setQuery("");
            setFilters({});
            setAiMode(false);
            setAiResult(null);
          }}
        >
          Everyone
        </button>
        <button
          className={filters.favorite ? "selected" : ""}
          aria-pressed={Boolean(filters.favorite)}
          onClick={() =>
            setFilters((current) => ({
              ...current,
              favorite: !current.favorite,
            }))
          }
        >
          <Heart size={13} /> Close network
        </button>
        {(
          ["class", "club", "event", "hometown", "industry", "venue"] as const
        ).map((k) => (
          <button
            key={k}
            className={filters[k]?.length ? "selected" : ""}
            onClick={() => setFilterOpen(true)}
          >
            {
              {
                class: "Class",
                club: "Club",
                event: "Event",
                hometown: "Hometown",
                industry: "Industry",
                venue: "Where you met",
              }[k]
            }
          </button>
        ))}
      </div>
      {error && <ErrorMessage error={error} retry={reload} />}
      <div className={`network-workspace ${list ? "list-mode" : ""}`}>
        {!data ? (
          <Loading />
        ) : !data.contacts.length ? (
          <div className="empty-state">
            <Avatar name={data.self.displayName} size="large" self />
            <h2>Your story starts with a hello.</h2>
            <p>Meet someone? Make your first Peerdrop.</p>
          </div>
        ) : (
          <>
            {!list && (
              <ReactFlowProvider>
                <Graph
                  network={displayedNetwork ?? data}
                  matches={new Set(matches.map((c) => c.connectionId))}
                  onSelect={setPerson}
                />
              </ReactFlowProvider>
            )}
            <aside
              className={`people-panel ${active || list ? "show-results" : ""}`}
            >
              <div className="people-panel-heading">
                <h2>
                  {active
                    ? aiMode
                      ? "Peerdrop suggests"
                      : "Found your people"
                    : list
                      ? "Your connections"
                      : "Recent hellos"}
                </h2>
                <span>{matches.length}</span>
              </div>
              {active && (
                <p className="results-caption">
                  {aiMode
                    ? aiResult?.usedFallback
                      ? "Smart matches from the details and memories shared with you."
                      : "AI-ranked from the details and memories shared with you."
                    : "Matches across the details and memories shared with you."}
                </p>
              )}
              <div className="people-list">
                {matches.map((c) => (
                  <ContactRow
                    key={c.connectionId}
                    contact={c}
                    reason={aiReasons.get(c.connectionId)}
                    onClick={() => setPerson(c.connectionId)}
                  />
                ))}
              </div>
              {!matches.length && (
                <div className="empty-state">
                  <Search />
                  <h3>No familiar faces yet</h3>
                  <p>
                    {aiMode
                      ? "Try describing the occasion or interest differently."
                      : "Try fewer words or clear your filters."}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setQuery("");
                      setFilters({});
                      setAiResult(null);
                    }}
                  >
                    Clear search & filters
                  </button>
                </div>
              )}
              <div className="people-footer">
                <MapPin size={16} />
                <p>
                  A place. A shared interest.
                  <br />
                  Sometimes that’s all it takes.
                </p>
              </div>
            </aside>
          </>
        )}
      </div>
      <div className="network-footer">
        <span>Made for the people behind the names.</span>
        {data?.contacts.some((c) => c.isDemo) && (
          <span>Includes fictional demo contacts</span>
        )}
      </div>
      {filterOpen && (
        <Sheet
          title="Find a familiar face"
          onClose={() => setFilterOpen(false)}
        >
          <div className="filter-form">
            {(
              [
                "class",
                "club",
                "event",
                "hometown",
                "industry",
                "venue",
              ] as const
            ).map((k) => {
              const options =
                k === "class" || k === "club"
                  ? catalog.affiliations
                      .filter((a) => a.kind === k)
                      .map((a) => ({ id: a.id, label: a.name }))
                  : k === "event"
                    ? (events.data?.map((e) => ({
                        id: e.id,
                        label: e.title,
                      })) ?? [])
                    : [
                        ...new Set(
                          data?.contacts
                            .map((c) => (k === "venue" ? c.venue : c.card[k]))
                            .filter(Boolean),
                        ),
                      ].map((v) => ({ id: v!, label: v! }));
              return (
                <fieldset key={k}>
                  <legend>
                    {
                      {
                        class: "Class",
                        club: "Club",
                        event: "Event",
                        hometown: "Hometown",
                        industry: "Previous industry",
                        venue: "Where you met",
                      }[k]
                    }
                  </legend>
                  {options.length ? (
                    options.map((o) => (
                      <Check
                        key={o.id}
                        label={o.label}
                        checked={filters[k]?.includes(o.id) ?? false}
                        onChange={(on) =>
                          setFilters((f) => ({
                            ...f,
                            [k]: on
                              ? [...(f[k] ?? []), o.id]
                              : f[k]?.filter((id) => id !== o.id),
                          }))
                        }
                      />
                    ))
                  ) : (
                    <p className="muted">
                      No shared details in this category yet.
                    </p>
                  )}
                </fieldset>
              );
            })}
            <fieldset>
              <legend>When you met</legend>
              <div className="field-grid">
                <label>
                  From
                  <input
                    type="date"
                    value={filters.from ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, from: e.target.value }))
                    }
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={filters.to ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, to: e.target.value }))
                    }
                  />
                </label>
              </div>
            </fieldset>
            <div className="note-actions">
              <button className="primary" onClick={() => setFilterOpen(false)}>
                Show {matches.length}{" "}
                {matches.length === 1 ? "person" : "people"}
              </button>
              <button className="text-button" onClick={() => setFilters({})}>
                Reset filters
              </button>
            </div>
          </div>
        </Sheet>
      )}
      {person && (
        <Sheet title="A familiar face" onClose={closePerson}>
          <PersonDetail id={person} />
        </Sheet>
      )}
    </div>
  );
}
