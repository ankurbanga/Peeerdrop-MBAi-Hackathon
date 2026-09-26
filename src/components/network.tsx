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
} from "lucide-react";
import type {
  Network as NetworkData,
  Filters,
  Contact,
} from "@/lib/domain/types";
import {
  matchesContact,
  radialPositions,
  displayDate,
} from "@/lib/domain/logic";
import { useResource } from "./use-resource";
import { useSession } from "./session";
import { Avatar, Sheet, ErrorMessage, Loading, Check } from "./ui";
import { PersonDetail } from "./person-detail";
const nodeTypes = { person: PersonNode };
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
      <Avatar name={String(data.name)} self={Boolean(data.self)} />
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
  const positions = useMemo(
    () => radialPositions(network.contacts.map((c) => c.card.id)),
    [network.contacts.map((c) => c.card.id).join(",")],
  );
  const nodes = [
    {
      id: network.self.id,
      type: "person",
      position: { x: 0, y: 0 },
      data: { name: network.self.displayName, self: true },
      ariaLabel: "You",
    },
    ...network.contacts.map((c, i) => ({
      ...positions[i],
      type: "person",
      data: {
        name: c.card.displayName,
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
    [flow, network.self.id, network.contacts.length],
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
}: {
  contact: Contact;
  onClick: () => void;
}) {
  return (
    <button className="contact-row" onClick={onClick}>
      <Avatar name={c.card.displayName} />
      <span className="contact-row-text">
        <strong>{c.card.displayName}</strong>
        <span>{c.card.industry ?? c.card.hometown ?? "A new connection"}</span>
        <small>
          {c.venue ?? "Your first hello"} · {displayDate(c.metAt)}
        </small>
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
    [person, setPerson] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(location.search).get("person");
    if (p) setPerson(p);
  }, []);
  const matches = useMemo(
    () => data?.contacts.filter((c) => matchesContact(c, query, filters)) ?? [],
    [data, query, filters],
  );
  const filterCount = Object.values(filters).filter((v) =>
      Array.isArray(v) ? v.length : Boolean(v),
    ).length,
    active = Boolean(query.trim() || filterCount);
  const events = useResource<{ id: string; title: string }[]>("/events", 0);
  function closePerson() {
    setPerson(null);
    if (location.search) history.replaceState(null, "", "/");
    void reload();
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
      <div className="search-toolbar">
        <div className="search-input">
          <Search size={20} />
          <input
            aria-label="Search your people"
            placeholder="Name, hobby, industry, anything…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={17} />
            </button>
          )}
        </div>
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
      <div className="quick-filters">
        <button
          className={!active ? "selected" : ""}
          onClick={() => {
            setQuery("");
            setFilters({});
          }}
        >
          Everyone
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
                  network={data}
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
                    ? "Found your people"
                    : list
                      ? "Your connections"
                      : "Recent hellos"}
                </h2>
                <span>{matches.length}</span>
              </div>
              {active && (
                <p className="results-caption">
                  Matches across the details and memories shared with you.
                </p>
              )}
              <div className="people-list">
                {matches.map((c) => (
                  <ContactRow
                    key={c.connectionId}
                    contact={c}
                    onClick={() => setPerson(c.connectionId)}
                  />
                ))}
              </div>
              {!matches.length && (
                <div className="empty-state">
                  <Search />
                  <h3>No familiar faces yet</h3>
                  <p>Try fewer words or clear your filters.</p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setQuery("");
                      setFilters({});
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
