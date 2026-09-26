"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, Copy, ShieldCheck, ArrowRight } from "lucide-react";
import { api, send } from "@/lib/client";
import { exchangeExpired } from "@/lib/domain/exchange";
import { makeCard } from "@/lib/domain/logic";
import type { ExchangeState, ShareField } from "@/lib/domain/types";
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
      initiator?: { displayName: string };
      displayName?: string;
      venue?: string;
      status?: string;
      expiresAt?: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [terminal, setTerminal] = useState(false);
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
      } catch {
        sessionStorage.removeItem("peerdrop-active");
      }
    }
  }, [receiver]);
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
      {!id ? (
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
              />
              <span>
                <strong>
                  {preview.initiator?.displayName ??
                    preview.displayName ??
                    "Someone"}{" "}
                  wants to connect
                </strong>
                <small>{preview.venue || "Meeting in person"}</small>
              </span>
            </div>
          )}
          <p className="muted">
            Choose what you share. Both people confirm before any selected
            details are released.
          </p>
          <ShareChoices selected={fields} onChange={setFields} />
          <div className="outgoing-card">
            <Avatar name={profile.display_name} />
            <div>
              <strong>{profile.display_name}</strong>
              <small>
                {chosen.length
                  ? chosen.map((f) => fieldLabels[f]).join(" · ")
                  : "Name only"}
              </small>
            </div>
          </div>
          <details className="card-preview">
            <summary>Preview your outgoing details</summary>
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
                } else {
                  const r = await send<{ id: string; url: string }>(
                    "/exchanges",
                    {
                      shareFields: fields,
                      ...(venue ? { venue } : {}),
                      ...(eventId ? { eventId } : {}),
                    },
                  );
                  setId(r.id);
                  setUrl(r.url);
                  sessionStorage.setItem("peerdrop-active", JSON.stringify(r));
                }
              })
            }
          >
            {busy
              ? "One moment…"
              : receiver
                ? "Request exchange"
                : "Create my QR code"}
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
