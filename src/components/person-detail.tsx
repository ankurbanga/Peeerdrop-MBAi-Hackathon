"use client";
import { useEffect, useState } from "react";
import {
  MapPin,
  LockKeyhole,
  MessageCircle,
  Mail,
  Phone,
  ArrowUpRight,
  Pencil,
  Trash2,
  Heart,
} from "lucide-react";
import type { Contact, Note } from "@/lib/domain/types";
import {
  displayDate,
  displayDateTime,
  relativeMetTime,
} from "@/lib/domain/logic";
import { send, api } from "@/lib/client";
import { useResource } from "./use-resource";
import { useSession } from "./session";
import { Avatar, ErrorMessage, Loading } from "./ui";
export function PersonDetail({ id }: { id: string }) {
  const eventCatalog = useResource<{ id: string; title: string }[]>("/events");
  const { data: c, error, reload } = useResource<Contact>(`/connections/${id}`),
    { profile } = useSession();
  const [privateBody, setPrivateBody] = useState(""),
    [sharedBody, setSharedBody] = useState(""),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [mutationError, setMutationError] = useState(""),
    [editId, setEditId] = useState<string | null>(null);
  useEffect(() => {
    if (c && !dirty)
      setPrivateBody(
        c.notes.find((n) => n.visibility === "private")?.body ?? "",
      );
  }, [c, dirty]);
  async function mutate(fn: () => Promise<unknown>) {
    setBusy(true);
    setMutationError("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setMutationError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!c)
    return error ? <ErrorMessage error={error} retry={reload} /> : <Loading />;
  const card = c.card,
    common = [...(card.classes ?? []), ...(card.clubs ?? [])].filter((a) =>
      c.commonAffiliationIds.includes(a.id),
    );
  return (
    <div className="person-detail">
      <div className="person-hero">
        <Avatar name={card.displayName} src={card.avatarUrl} size="large" />
        <h2>{card.displayName}</h2>
        {card.industry && <p>{card.industry}</p>}
        {card.graduationYear && (
          <p className="cohort-label">Class of {card.graduationYear}</p>
        )}
        <button
          className={`favorite-toggle ${c.favorite ? "selected" : ""}`}
          aria-pressed={c.favorite}
          aria-label={`${c.favorite ? "Remove" : "Add"} ${card.displayName} ${c.favorite ? "from" : "to"} close network`}
          disabled={busy}
          onClick={() =>
            mutate(() =>
              send(
                `/connections/${id}/favorite`,
                { favorite: !c.favorite },
                "PUT",
              ),
            )
          }
        >
          <Heart size={16} fill={c.favorite ? "currentColor" : "none"} />
          {c.favorite ? "In your close network" : "Add to close network"}
        </button>
        {c.isDemo && <span className="demo-label">Fictional demo contact</span>}
      </div>
      <div className="met-context">
        <MapPin size={18} />
        <div>
          <strong>{c.venue ? `Met at ${c.venue}` : "Your first hello"}</strong>
          <small>
            {relativeMetTime(c.metAt)} · {displayDateTime(c.metAt)} CT
            {c.eventTitle ? ` · ${c.eventTitle}` : ""}
          </small>
        </div>
      </div>
      {common.length > 0 && (
        <section>
          <h3>Some common ground</h3>
          <div className="tag-list">
            {common.map((a) => (
              <span key={a.id}>{a.name}</span>
            ))}
          </div>
        </section>
      )}
      {c.eventIds.length > 0 && (
        <section>
          <h3>Events in common</h3>
          <div className="tag-list">
            {c.eventIds.map((id) => {
              const event = eventCatalog.data?.find((e) => e.id === id);
              return event ? (
                <span key={id}>{event.title} · interested</span>
              ) : null;
            })}
          </div>
        </section>
      )}
      <section>
        <h3>
          <LockKeyhole size={16} />
          Just for you
        </h3>
        <p className="muted">A private reminder. Only you can see this.</p>
        <label className="sr-only" htmlFor="private-note">
          Private reminder
        </label>
        <textarea
          id="private-note"
          rows={3}
          maxLength={2000}
          placeholder="What will help you remember them?"
          value={privateBody}
          onChange={(e) => {
            setDirty(true);
            setPrivateBody(e.target.value);
          }}
        />
        <div className="note-actions">
          <button
            className="secondary"
            disabled={busy || !privateBody.trim()}
            onClick={() =>
              mutate(async () => {
                await send(`/connections/${id}/notes`, {
                  visibility: "private",
                  body: privateBody,
                });
                setDirty(false);
              })
            }
          >
            Save reminder
          </button>
          {c.notes.some((n) => n.visibility === "private") && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                mutate(async () => {
                  await api(
                    `/notes/${c.notes.find((n) => n.visibility === "private")!.id}`,
                    { method: "DELETE" },
                  );
                  setPrivateBody("");
                  setDirty(false);
                })
              }
            >
              Delete
            </button>
          )}
        </div>
      </section>
      <section>
        <h3>
          <MessageCircle size={17} />
          Shared memories
        </h3>
        <p className="muted">
          Visible to both of you. Each person edits their own.
        </p>
        {c.notes
          .filter((n) => n.visibility === "shared")
          .map((n) => (
            <article className="memory" key={n.id}>
              <small>
                {n.author_id === profile?.id ? "You" : card.displayName} ·{" "}
                {displayDate(n.created_at)}
              </small>
              <p>{n.body}</p>
              {n.author_id === profile?.id && (
                <div className="memory-actions">
                  <button
                    className="icon-button"
                    aria-label="Edit memory"
                    onClick={() => {
                      setEditId(n.id);
                      setSharedBody(n.body);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Delete memory"
                    disabled={busy}
                    onClick={() =>
                      mutate(() => api(`/notes/${n.id}`, { method: "DELETE" }))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </article>
          ))}
        <label className="sr-only" htmlFor="shared-note">
          Shared memory
        </label>
        <textarea
          id="shared-note"
          rows={2}
          maxLength={2000}
          placeholder="Something you both talked about…"
          value={sharedBody}
          onChange={(e) => setSharedBody(e.target.value)}
        />
        <div className="note-actions">
          <button
            className="secondary"
            disabled={busy || !sharedBody.trim()}
            onClick={() =>
              mutate(async () => {
                if (editId)
                  await send(`/notes/${editId}`, { body: sharedBody }, "PATCH");
                else
                  await send(`/connections/${id}/notes`, {
                    visibility: "shared",
                    body: sharedBody,
                  });
                setSharedBody("");
                setEditId(null);
              })
            }
          >
            {editId ? "Save memory" : "Share a memory"}
          </button>
          {editId && (
            <button
              className="text-button"
              onClick={() => {
                setEditId(null);
                setSharedBody("");
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </section>
      <section>
        <h3>A little more about {card.displayName.split(" ")[0]}</h3>
        <dl className="person-facts">
          {(
            [
              "hometown",
              "hobbies",
              "funFact",
            ] as const
          )
            .filter((k) => Boolean(card[k]))
            .map((k) => (
              <div key={k}>
                <dt>
                  {
                    {
                      hometown: "From",
                      hobbies: "Into",
                      funFact: "Fun fact",
                    }[k]
                  }
                </dt>
                <dd>
                  {Array.isArray(card[k])
                    ? (card[k] as string[]).join(", ")
                    : card[k]}
                </dd>
              </div>
            ))}
          {[...(card.classes ?? []), ...(card.clubs ?? [])].length > 0 && (
            <div>
              <dt>Shared spaces</dt>
              <dd>
                {[...(card.classes ?? []), ...(card.clubs ?? [])]
                  .map((a) => a.name)
                  .join(", ")}
              </dd>
            </div>
          )}
        </dl>
      </section>
      {card.contact && (
        <section>
          <h3>Restart the conversation</h3>
          <div className="contact-actions">
            {card.contact.email && (
              <a href={`mailto:${card.contact.email}`}>
                <Mail size={17} />
                Email
              </a>
            )}
            {card.contact.phone && (
              <a href={`tel:${card.contact.phone.replace(/[^+\d]/g, "")}`}>
                <Phone size={17} />
                Call
              </a>
            )}
            {(["instagram", "linkedin"] as const).map(
              (k) =>
                card.contact?.[k]?.startsWith("https://") && (
                  <a
                    key={k}
                    href={card.contact[k]}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {k === "instagram" ? "Instagram" : "LinkedIn"}
                    <ArrowUpRight size={17} />
                  </a>
                ),
            )}
          </div>
        </section>
      )}
      {(mutationError || error) && (
        <ErrorMessage error={mutationError || error} retry={reload} />
      )}
    </div>
  );
}
