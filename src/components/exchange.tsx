"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  CheckCircle2,
  Copy,
  ShieldCheck,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";
import { api, send } from "@/lib/client";
import { exchangeExpired } from "@/lib/domain/exchange";
import { makeCard } from "@/lib/domain/logic";
import {
  shareFields as shareFieldOptions,
  type ExchangeState,
  type ShareField,
} from "@/lib/domain/types";
import { useSession } from "./session";
import { Avatar, Check, ErrorMessage, Loading } from "./ui";
import { ShareChoices, fieldLabels } from "./profile-editor";
import { useResource } from "./use-resource";
export function Exchange({
  receiver = false,
  onDone,
}: {
  receiver?: boolean;
  onDone?: () => void;
}) {
  const { profile, catalog } = useSession(),
    router = useRouter();
  const [fields, setFields] = useState<ShareField[]>(
      profile?.default_share_fields ?? [],
    ),
    [venue, setVenue] = useState(""),
    [eventId, setEventId] = useState(""),
    [id, setId] = useState<string | null>(null),
    [url, setUrl] = useState(""),
    [token, setToken] = useState(""),
    [preview, setPreview] = useState<{
      id?: string;
      initiator?: {
        displayName: string;
        avatarUrl?: string | null;
        graduationYear?: number;
      };
      displayName?: string;
      venue?: string;
      status?: string;
      expiresAt?: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [terminal, setTerminal] = useState(false),
    [editing, setEditing] = useState(false),
    [readyToCreate, setReadyToCreate] = useState(receiver);
  const creating = useRef(false),
    lastCreatedSignature = useRef("");
  const state = useResource<ExchangeState>(
    id && !terminal ? `/exchanges/${id}` : null,
    2000,
  );
  const [lastState, setLastState] = useState<ExchangeState | null>(null);
  const active = state.data ?? lastState;
  const events = useResource<{ id: string; title: string }[]>("/events", 0);
  useEffect(() => {
    if (!receiver) return;
    const stored = sessionStorage.getItem("peerdrop-invite") ?? "";
    setToken(stored);
    if (!stored) {
      setError(
        "This invite is missing. Ask the other person for a new Peerdrop.",
      );
      return;
    }
    void loadPreview(stored);
  }, [receiver]);
  useEffect(() => {
    if (receiver) return;
    const stored = sessionStorage.getItem("peerdrop-active");
    if (stored) {
      try {
        const saved = JSON.parse(stored);
        setId(saved.id);
        setUrl(saved.url ?? "");
        if (Array.isArray(saved.shareFields))
          setFields(
            saved.shareFields.filter((field: unknown): field is ShareField =>
              shareFieldOptions.includes(field as ShareField),
            ),
          );
        setVenue(typeof saved.venue === "string" ? saved.venue : "");
        setEventId(typeof saved.eventId === "string" ? saved.eventId : "");
        lastCreatedSignature.current = saved.signature ?? inviteSignature();
      } catch {
        sessionStorage.removeItem("peerdrop-active");
      }
    }
    setReadyToCreate(true);
  }, [receiver]);
  useEffect(() => {
    if (receiver || !profile || !readyToCreate || id || creating.current)
      return;
    void createInvite();
  }, [id, profile, readyToCreate, receiver]);
  useEffect(() => {
    if (
      receiver ||
      !editing ||
      !id ||
      !url ||
      busy ||
      inviteSignature() === lastCreatedSignature.current
    )
      return;
    const timer = window.setTimeout(() => void replaceInvite(), 450);
    return () => window.clearTimeout(timer);
  }, [busy, editing, eventId, fields, id, receiver, url, venue]);
  useEffect(() => {
    if (state.data) {
      setLastState(state.data);
      if (
        state.data.status === "accepted" ||
        state.data.status === "cancelled" ||
        exchangeExpired(state.data, Date.now())
      ) {
        setTerminal(true);
        sessionStorage.removeItem("peerdrop-active");
      }
    }
  }, [state.data]);
  async function loadPreview(value: string) {
    setError("");
    try {
      const result = await api<typeof preview>(
        `/exchanges/preview?token=${encodeURIComponent(value)}`,
      );
      setPreview(result);
      if (
        result?.id &&
        (result.status === "requested" || result.status === "accepted")
      )
        setId(result.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function restart() {
    sessionStorage.removeItem("peerdrop-active");
    setId(null);
    setLastState(null);
    setTerminal(false);
    setUrl("");
    setError("");
    setEditing(false);
    creating.current = false;
    lastCreatedSignature.current = "";
    if (receiver) {
      sessionStorage.removeItem("peerdrop-invite");
      router.push("/");
    }
  }

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function inviteSignature() {
    return JSON.stringify({
      fields: [...fields].sort(),
      venue: venue.trim(),
      eventId,
    });
  }
  async function createInvite() {
    if (creating.current) return;
    creating.current = true;
    setBusy(true);
    setError("");
    try {
      const signature = inviteSignature();
      const result = await send<{ id: string; url: string }>("/exchanges", {
        shareFields: fields,
        ...(venue.trim() ? { venue: venue.trim() } : {}),
        ...(eventId ? { eventId } : {}),
      });
      setId(result.id);
      setUrl(result.url);
      setTerminal(false);
      setLastState(null);
      lastCreatedSignature.current = signature;
      sessionStorage.setItem(
        "peerdrop-active",
        JSON.stringify({
          ...result,
          signature,
          shareFields: fields,
          venue: venue.trim(),
          eventId,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      creating.current = false;
      setBusy(false);
    }
  }
  async function replaceInvite() {
    if (!id || creating.current) return;
    creating.current = true;
    setBusy(true);
    setError("");
    try {
      await send(`/exchanges/${id}/cancel`, {});
      creating.current = false;
      await createInvite();
      await state.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      creating.current = false;
    }
  }
  if (!profile) return <Loading />;
  const card = makeCard(profile, fields);
  const chosen = fields.filter((f) =>
    f === "classes" || f === "clubs"
      ? Boolean(card[f]?.length)
      : ["phone", "email", "instagram", "linkedin"].includes(f)
        ? Boolean(card.contact?.[f as keyof typeof card.contact])
        : Boolean(card[f as keyof typeof card]),
  );
  if (active?.status === "accepted")
    return (
      <div className="exchange-success">
        <CheckCircle2 size={48} />
        <h2>A hello, remembered.</h2>
        <p>
          You and {active.counterpart?.displayName ?? "your new connection"} are
          now connected.
        </p>
        <p className="muted">
          What will help you remember them? Add a private reminder from their
          card.
        </p>
        <button
          className="primary"
          onClick={() => {
            sessionStorage.removeItem("peerdrop-invite");
            onDone?.();
            router.push(`/?person=${active.connectionId}`);
          }}
        >
          Remember this moment <ArrowRight size={16} />
        </button>
      </div>
    );
  if (active && exchangeExpired(active, Date.now()))
    return (
      <div className="empty-state">
        <h2>This Peerdrop has expired</h2>
        <p>
          No new details were shared.{" "}
          {receiver
            ? "Ask the other person for a new invite."
            : "Create a new QR code to try again."}
        </p>
        <button className="primary" onClick={restart}>
          {receiver ? "Back to your people" : "Create a new Peerdrop"}
        </button>
      </div>
    );
  if (active?.status === "cancelled")
    return (
      <div className="empty-state">
        <h2>Exchange cancelled</h2>
        <p>No details were shared.</p>
        <button className="primary" onClick={restart}>
          Start again
        </button>
      </div>
    );
  return (
    <div className="exchange-flow">
      {!id && !receiver ? (
        <div className="empty-state exchange-loading">
          <span className="pulse-dot" />
          <h2>Making your Peerdrop…</h2>
          <p>Your saved sharing preferences are already included.</p>
          {error && <ErrorMessage error={error} retry={createInvite} />}
        </div>
      ) : !id ? (
        <>
          <p className="lead">
            {receiver
              ? "A new connection starts here."
              : "A small card. A lasting connection."}
          </p>
          {receiver && preview && (
            <div className="invite-person">
              <Avatar
                name={
                  preview.initiator?.displayName ??
                  preview.displayName ??
                  "New connection"
                }
                src={preview.initiator?.avatarUrl}
              />
              <span>
                <strong>
                  {preview.initiator?.displayName ??
                    preview.displayName ??
                    "Someone"}{" "}
                  wants to connect
                </strong>
                <small>
                  {preview.initiator?.graduationYear
                    ? `Class of ${preview.initiator.graduationYear} · `
                    : ""}
                  {preview.venue || "Meeting in person"}
                </small>
              </span>
            </div>
          )}
          <p className="muted">
            Choose what you share. Both people confirm before any selected
            details are released.
          </p>
          <ShareChoices selected={fields} onChange={setFields} />
          <div className="outgoing-card">
            <Avatar name={profile.display_name} src={profile.avatar_url} />
            <div>
              <strong>{profile.display_name}</strong>
              <small>
                Photo when available · Class of {profile.graduation_year}
                {chosen.length
                  ? ` · ${chosen.map((f) => fieldLabels[f]).join(" · ")}`
                  : ""}
              </small>
            </div>
          </div>
          <details className="card-preview">
            <summary>Preview your outgoing details</summary>
            <p>
              <strong>Always shared: </strong>
              Name, photo when available, Class of {profile.graduation_year}
            </p>
            {chosen.map((f) => (
              <p key={f}>
                <strong>{fieldLabels[f]}: </strong>
                {f === "classes" || f === "clubs"
                  ? card[f]?.map((a) => a.name).join(", ")
                  : ["phone", "email", "instagram", "linkedin"].includes(f)
                    ? card.contact?.[f as keyof typeof card.contact]
                    : Array.isArray(card[f as keyof typeof card])
                      ? (card[f as keyof typeof card] as string[]).join(", ")
                      : String(card[f as keyof typeof card] ?? "")}
              </p>
            ))}
          </details>
          {!receiver && (
            <>
              <label>
                Where did you meet?
                <input
                  list="venues"
                  placeholder="Choose a place or type your own"
                  maxLength={200}
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                />
                <datalist id="venues">
                  {catalog.venues.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </datalist>
              </label>
              <label>
                At an event? <span className="muted">Optional</span>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                >
                  <option value="">No event selected</option>
                  {events.data?.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {error && (
            <>
              <ErrorMessage
                error={error}
                retry={receiver ? () => loadPreview(token) : undefined}
              />
              {receiver && (
                <button className="text-button full" onClick={restart}>
                  Back to your people · ask for a new invite
                </button>
              )}
            </>
          )}
          <button
            className="primary full"
            disabled={busy || (receiver && !preview)}
            onClick={() =>
              act(async () => {
                if (receiver) {
                  const r = await send<{ id: string }>("/exchanges/request", {
                    token,
                    shareFields: fields,
                  });
                  setId(r.id);
                }
              })
            }
          >
            {busy ? "One moment…" : "Request exchange"}
            <ArrowRight size={18} />
          </button>
        </>
      ) : (
        <>
          {active?.counterpart && (
            <div className="invite-person">
              <Avatar name={active.counterpart.displayName} />
              <span>
                <strong>{active.counterpart.displayName}</strong>
                <small>
                  {active.status === "requested"
                    ? "Ready to exchange"
                    : "Your new connection"}
                </small>
              </span>
            </div>
          )}
          {url && active?.status !== "requested" && (
            <>
              <div className="qr-wrap">
                <QRCodeSVG value={url} size={210} level="M" marginSize={2} />
              </div>
              <h3 className="text-center">Say hello. Scan. Connect.</h3>
              <p className="muted text-center">
                Ask them to scan with their phone camera.
                <br />
                You’ll confirm it’s them before sharing.
              </p>
              <button
                className="secondary full"
                onClick={() =>
                  act(async () => {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                  })
                }
              >
                <Copy size={16} />
                {copied ? "Link copied" : "Copy exchange link"}
              </button>
              <button
                className="text-button full"
                aria-expanded={editing}
                onClick={() => setEditing((value) => !value)}
              >
                <SlidersHorizontal size={16} />
                {editing ? "Done changing" : "Change what I’m sharing"}
              </button>
              {editing && (
                <fieldset className="exchange-preferences" disabled={busy}>
                  <legend>Included in this Peerdrop</legend>
                  <p className="muted">
                    This only changes this QR. Your saved defaults stay the
                    same.
                  </p>
                  <ShareChoices selected={fields} onChange={setFields} />
                  <label>
                    Where did you meet?
                    <input
                      list="venues"
                      placeholder="Choose a place or type your own"
                      maxLength={200}
                      value={venue}
                      onChange={(event) => setVenue(event.target.value)}
                    />
                    <datalist id="venues">
                      {catalog.venues.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </datalist>
                  </label>
                  <label>
                    At an event? <span className="muted">Optional</span>
                    <select
                      value={eventId}
                      onChange={(event) => setEventId(event.target.value)}
                    >
                      <option value="">No event selected</option>
                      {events.data?.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="fine-print">
                    {busy
                      ? "Updating your QR…"
                      : "Changes update the QR automatically."}
                  </p>
                </fieldset>
              )}
            </>
          )}
          {active?.status === "requested" && active.isInitiator ? (
            <>
              <p>
                Is this the person you’re meeting? Accept to share both selected
                cards.
              </p>
              <button
                className="primary full"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await send(`/exchanges/${id}/accept`, {});
                    await state.reload();
                  })
                }
              >
                Yes, exchange cards <CheckCircle2 size={18} />
              </button>
            </>
          ) : (
            <p className="waiting">
              <span className="pulse-dot" />
              {receiver
                ? "Waiting for their confirmation…"
                : "Waiting for someone to scan…"}
            </p>
          )}
          {active?.expiresAt && (
            <p className="fine-print text-center">
              Expires at{" "}
              {new Date(active.expiresAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
          {(error || state.error) && (
            <ErrorMessage error={error || state.error} retry={state.reload} />
          )}
          <button
            className="text-button full"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await send(`/exchanges/${id}/cancel`, {});
                await state.reload();
              })
            }
          >
            Cancel exchange
          </button>
        </>
      )}
      <div className="privacy-caption">
        <ShieldCheck size={16} />
        Your details stay yours until you both agree.
      </div>
    </div>
  );
}
