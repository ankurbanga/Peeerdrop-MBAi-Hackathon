"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check as CheckIcon, ShieldCheck } from "lucide-react";
import { useSession, Logo } from "./session";
import { Check, ErrorMessage } from "./ui";
import { send } from "@/lib/client";
import { shareFields, type ShareField, type Details } from "@/lib/domain/types";
export const fieldLabels: Record<ShareField, string> = {
  hometown: "Hometown",
  industry: "Previous industry",
  hobbies: "Hobbies",
  movies: "Favorite movies",
  funFact: "Fun fact",
  relationshipStatus: "Relationship status",
  phone: "Phone",
  email: "Email",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  classes: "Classes",
  clubs: "Clubs",
};
export function ShareChoices({
  selected,
  onChange,
}: {
  selected: ShareField[];
  onChange: (v: ShareField[]) => void;
}) {
  return (
    <div className="share-choices">
      {shareFields.map((key) => (
        <Check
          key={key}
          label={fieldLabels[key]}
          checked={selected.includes(key)}
          onChange={(on) =>
            onChange(
              on ? [...selected, key] : selected.filter((x) => x !== key),
            )
          }
        />
      ))}
    </div>
  );
}
export function ProfileEditor({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
  const { profile, reload, catalog } = useSession(),
    router = useRouter();
  const [name, setName] = useState(profile?.display_name ?? ""),
    [details, setDetails] = useState<Details>(profile?.details ?? {}),
    [listDrafts, setListDrafts] = useState({
      hobbies: profile?.details.hobbies?.join(", ") ?? "",
      movies: profile?.details.movies?.join(", ") ?? "",
    }),
    [fields, setFields] = useState<ShareField[]>(
      profile?.default_share_fields ?? [],
    ),
    [affiliations, setAffiliations] = useState<string[]>(
      profile?.affiliations.map((a) => a.id) ?? [],
    ),
    [visible, setVisible] = useState(profile?.graph_visible ?? false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  function detail(key: keyof Details, value: string) {
    if (key === "hobbies" || key === "movies")
      setListDrafts((d) => ({ ...d, [key]: value }));
    else setDetails((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await send(
        "/me",
        {
          displayName: name,
          details: {
            ...details,
            hobbies: listDrafts.hobbies
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
            movies: listDrafts.movies
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          },
          defaultShareFields: fields,
          graphVisible: visible,
          affiliationIds: affiliations,
        },
        "PUT",
      );
      await reload();
      setSaved(true);
      if (onboarding)
        router.replace(
          sessionStorage.getItem("peerdrop-invite") ? "/exchange" : "/",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={onboarding ? "onboarding" : "profile-page"}>
      {onboarding && (
        <div className="brand">
          <Logo />
          peerdrop
        </div>
      )}
      <header className="page-heading">
        <h1>
          {onboarding ? "A hello worth remembering." : "Your personal card"}
        </h1>
        <p>
          {onboarding
            ? "Start with your name. Everything else is up to you."
            : "A little about you. Shared only when you choose."}
        </p>
      </header>
      <form onSubmit={save} className="profile-form">
        <section>
          <h2>{onboarding ? "Let’s start with you" : "The essentials"}</h2>
          <label>
            Display name
            <input
              required
              maxLength={200}
              autoComplete="name"
              placeholder="What should people call you?"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="field-grid">
            {(["hometown", "industry", "hobbies", "movies"] as const).map(
              (key) => (
                <label key={key}>
                  {fieldLabels[key]}
                  <input
                    maxLength={
                      key === "hobbies" || key === "movies" ? 1000 : 200
                    }
                    placeholder={
                      key === "hobbies" || key === "movies"
                        ? "Separate with commas"
                        : "Optional"
                    }
                    value={
                      key === "hobbies" || key === "movies"
                        ? listDrafts[key]
                        : (details[key] ?? "")
                    }
                    onChange={(e) => detail(key, e.target.value)}
                  />
                </label>
              ),
            )}
          </div>
          <label>
            Fun fact
            <textarea
              maxLength={500}
              rows={2}
              placeholder="Something they might remember…"
              value={details.funFact ?? ""}
              onChange={(e) => detail("funFact", e.target.value)}
            />
          </label>
        </section>
        <section>
          <h2>Your shared spaces</h2>
          <p className="muted">Self-selected classes and clubs.</p>
          <div className="choice-chips">
            {catalog.affiliations.map((a) => (
              <label
                className={affiliations.includes(a.id) ? "selected" : ""}
                key={a.id}
              >
                <input
                  type="checkbox"
                  checked={affiliations.includes(a.id)}
                  onChange={(e) =>
                    setAffiliations(
                      e.target.checked
                        ? [...affiliations, a.id]
                        : affiliations.filter((id) => id !== a.id),
                    )
                  }
                />
                {a.name}
              </label>
            ))}
          </div>
        </section>
        <details className="form-disclosure">
          <summary>
            Contact details & personal context <span>Optional</span>
          </summary>
          <div className="field-grid">
            {(["phone", "email", "instagram", "linkedin"] as const).map(
              (key) => (
                <label key={key}>
                  {fieldLabels[key]}
                  <input
                    type={
                      key === "email"
                        ? "email"
                        : key === "phone"
                          ? "tel"
                          : "url"
                    }
                    placeholder={
                      key === "instagram" || key === "linkedin"
                        ? "https://…"
                        : "Optional"
                    }
                    value={details.contact?.[key] ?? ""}
                    onChange={(e) =>
                      setDetails((d) => ({
                        ...d,
                        contact: { ...d.contact, [key]: e.target.value },
                      }))
                    }
                  />
                </label>
              ),
            )}
            <label>
              Relationship status
              <input
                maxLength={200}
                value={details.relationshipStatus ?? ""}
                placeholder="Optional · not shared by default"
                onChange={(e) => detail("relationshipStatus", e.target.value)}
              />
            </label>
          </div>
        </details>
        <section>
          <h2>Choose what travels with your card</h2>
          <p className="muted">
            Your name is always included. You can change these choices for each
            Peerdrop.
          </p>
          <ShareChoices selected={fields} onChange={setFields} />
        </section>
        <section className="privacy-section">
          <ShieldCheck size={22} />
          <div>
            <h2>Your connections, your choice</h2>
            <Check
              label="Show my connections to mutual contacts"
              checked={visible}
              onChange={setVisible}
              description="A connection appears only when both people switch this on. Your notes and card details stay private."
            />
          </div>
        </section>
        <p className="fine-print">
          This identity is saved on this browser. Account recovery is not
          available. Profile changes apply to future exchanges.
        </p>
        {error && <ErrorMessage error={error} />}
        <button className="primary save-button" disabled={busy}>
          {busy
            ? "Saving…"
            : saved
              ? "Saved"
              : onboarding
                ? "Create my card"
                : "Save changes"}
          {saved ? <CheckIcon size={18} /> : <ArrowRight size={18} />}
        </button>
      </form>
    </div>
  );
}
