"use client";
import { useState } from "react";
import {
  MapPin,
  ArrowUpRight,
  Check as CheckIcon,
  Plus,
  CalendarDays,
} from "lucide-react";
import { useResource } from "./use-resource";
import { send } from "@/lib/client";
import type { EventItem } from "@/lib/domain/types";
import { Avatar, Check, ErrorMessage, Loading } from "./ui";
export function EventsScreen() {
  const { data, error, reload } = useResource<EventItem[]>("/events"),
    [forYou, setForYou] = useState(false),
    [busy, setBusy] = useState<string | null>(null),
    [mutationError, setMutationError] = useState("");
  async function interest(e: EventItem, interested: boolean, share: boolean) {
    setBusy(e.id);
    setMutationError("");
    try {
      await send(
        `/events/${e.id}/interest`,
        { interested, shareWithConnections: share },
        "PUT",
      );
      await reload();
    } catch (e) {
      setMutationError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const filtered = data?.filter((e) => !forYou || e.reasons.length);
  return (
    <div className="events-page">
      <header className="page-heading">
        <h1>
          A reason to reconnect<span className="heading-dot">.</span>
        </h1>
        <p>Find your next shared moment.</p>
      </header>
      <div className="events-toolbar">
        <div className="segmented">
          <button
            className={!forYou ? "selected" : ""}
            onClick={() => setForYou(false)}
          >
            Upcoming
          </button>
          <button
            className={forYou ? "selected" : ""}
            onClick={() => setForYou(true)}
          >
            For you
          </button>
        </div>
        <span className="muted">Interest is a signal, not an RSVP.</span>
      </div>
      {(error || mutationError) && (
        <ErrorMessage error={error || mutationError} retry={reload} />
      )}
      <div className="event-list">
        {!data ? (
          <Loading />
        ) : !filtered?.length ? (
          <div className="empty-state">
            <CalendarDays />
            <h2>No upcoming matches</h2>
            <p>Check all events, or add interests to your card.</p>
            <button className="secondary" onClick={() => setForYou(false)}>
              Show all events
            </button>
          </div>
        ) : (
          filtered.map((e) => (
            <article className="event-card" key={e.id}>
              <div className="event-date">
                <span>
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    timeZone: "America/Chicago",
                  }).format(new Date(e.starts_at))}
                </span>
                <strong>
                  {new Intl.DateTimeFormat("en-US", {
                    day: "numeric",
                    timeZone: "America/Chicago",
                  }).format(new Date(e.starts_at))}
                </strong>
              </div>
              <div className="event-content">
                {e.is_demo && (
                  <span className="demo-label">Fictional sample event</span>
                )}
                <h2>{e.title}</h2>
                <div className="event-meta">
                  <span>
                    <MapPin size={15} />
                    {e.venue}
                  </span>
                  <span>
                    {new Intl.DateTimeFormat("en-US", {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: "America/Chicago",
                    }).format(new Date(e.starts_at))}
                  </span>
                </div>
                <div className="tag-list">
                  {e.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                {e.reasons.length > 0 && (
                  <p className="relevance">
                    A little common ground: {e.reasons.join(", ")}
                  </p>
                )}
                {e.interestedContacts.length > 0 && (
                  <div className="interested-people">
                    {e.interestedContacts.slice(0, 3).map((c) => (
                      <Avatar key={c.id} name={c.displayName} size="small" />
                    ))}
                    <span>
                      {e.interestedContacts
                        .map((c) => c.displayName.split(" ")[0])
                        .join(", ")}{" "}
                      {e.interestedContacts.length === 1 ? "is" : "are"}{" "}
                      interested
                    </span>
                  </div>
                )}
                <div className="event-actions">
                  <button
                    className={
                      e.interested ? "secondary selected" : "secondary"
                    }
                    disabled={busy === e.id}
                    onClick={() => interest(e, !e.interested, false)}
                  >
                    {e.interested ? (
                      <CheckIcon size={17} />
                    ) : (
                      <Plus size={17} />
                    )}{" "}
                    {e.interested ? "Interested" : "I’m interested"}
                  </button>
                  {e.external_url?.startsWith("https://") && (
                    <a
                      href={e.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open event <ArrowUpRight size={17} />
                    </a>
                  )}
                </div>
                {e.interested && (
                  <Check
                    label="Share my interest with connections"
                    checked={e.shareWithConnections}
                    onChange={(v) => {
                      if (!busy) void interest(e, true, v);
                    }}
                    description="Off by default. Only your direct connections can see this."
                  />
                )}
              </div>
            </article>
          ))
        )}
      </div>
      <p className="fine-print">
        Times shown in Chicago time. Sample events are fictional; no RSVP or
        account integration is implied.
      </p>
    </div>
  );
}
