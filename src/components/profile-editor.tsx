"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check as CheckIcon,
  ShieldCheck,
  Search,
  X,
} from "lucide-react";
import { useSession, Logo } from "./session";
import { Avatar, Check, ErrorMessage } from "./ui";
import { send } from "@/lib/client";
import { shareFields, type ShareField, type Details } from "@/lib/domain/types";
import { addUniqueTag, normalize } from "@/lib/domain/logic";
export const fieldLabels: Record<ShareField, string> = {
  hometown: "Hometown",
  industry: "Previous industry",
  hobbies: "Hobbies",
  funFact: "Fun fact",
  phone: "Phone",
  email: "Email",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  classes: "Classes",
  clubs: "Clubs",
};
function HobbyPicker({
  values,
  options,
  onChange,
}: {
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const suggestions = options.filter(
    (option) =>
      !values.some((value) => normalize(value) === normalize(option)) &&
      normalize(option).includes(normalize(query)),
  );
  function add(value: string) {
    onChange(addUniqueTag(values, value));
    setQuery("");
  }
  return (
    <div className="tag-picker">
      <div className="selected-tags">
        {values.map((value) => (
          <button
            type="button"
            key={value}
            onClick={() => onChange(values.filter((item) => item !== value))}
            aria-label={`Remove ${value}`}
          >
            {value} <X size={14} />
          </button>
        ))}
      </div>
      <div className="picker-search">
        <Search size={17} />
        <input
          aria-label="Search or add a hobby"
          placeholder="Search common hobbies or add your own"
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim()) {
              event.preventDefault();
              add(query);
            }
          }}
        />
      </div>
      {(query ? suggestions : suggestions.slice(0, 6)).length > 0 && (
        <div className="picker-options">
          {(query ? suggestions : suggestions.slice(0, 6)).map((option) => (
            <button type="button" key={option} onClick={() => add(option)}>
              + {option}
            </button>
          ))}
          {query.trim() &&
            !options.some(
              (option) => normalize(option) === normalize(query),
            ) && (
              <button type="button" onClick={() => add(query)}>
                Add “{query.trim()}”
              </button>
            )}
        </div>
      )}
    </div>
  );
}
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
    [graduationYear, setGraduationYear] = useState(
      profile?.graduation_year ?? 2028,
    ),
    [details, setDetails] = useState<Details>(profile?.details ?? {}),
    [fields, setFields] = useState<ShareField[]>(
      profile?.default_share_fields ?? [],
    ),
    [affiliations, setAffiliations] = useState<string[]>(
      profile?.affiliations.map((a) => a.id) ?? [],
    ),
    [visible, setVisible] = useState(profile?.graph_visible ?? false),
    [spaceQuery, setSpaceQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  function detail(key: keyof Details, value: string) {
    setDetails((d) => ({ ...d, [key]: value }));
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
          graduationYear,
          details,
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
        <h1>{onboarding ? "Who are you?" : "Your personal card"}</h1>
        <p>
          {onboarding
            ? "Your name and cohort help people place the hello. You choose everything else."
            : "A little about you. Shared only when you choose."}
        </p>
      </header>
      <form onSubmit={save} className="profile-form">
        <div className="directory-identity">
          <Avatar
            name={name || "Your profile"}
            src={profile?.avatar_url ?? "/avatars/default-profile.png"}
            size="large"
          />
          <div>
            <strong>{name || "Your directory photo"}</strong>
            <span>From the Kellogg directory · demo</span>
          </div>
        </div>
        <section>
          <h2>The essentials</h2>
          <div className="field-grid identity-fields">
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
            <label>
              Graduation year
              <select
                required
                value={graduationYear}
                onChange={(e) => setGraduationYear(Number(e.target.value))}
              >
                {[2027, 2028, 2029, 2030].map((year) => (
                  <option key={year} value={year}>
                    Class of {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-grid">
            {(["hometown", "industry"] as const).map((key) => (
              <label key={key}>
                {fieldLabels[key]}
                <input
                  maxLength={200}
                  placeholder="Optional"
                  value={details[key] ?? ""}
                  onChange={(e) => detail(key, e.target.value)}
                />
              </label>
            ))}
          </div>
          <label className="picker-label">Hobbies</label>
          <HobbyPicker
            values={details.hobbies ?? []}
            options={catalog.hobbies}
            onChange={(hobbies) =>
              setDetails((current) => ({ ...current, hobbies }))
            }
          />
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
          <p className="muted">
            Search classes and clubs synced from CampusGroups · demo
          </p>
          <div className="selected-tags">
            {catalog.affiliations
              .filter((space) => affiliations.includes(space.id))
              .map((space) => (
                <button
                  type="button"
                  key={space.id}
                  onClick={() =>
                    setAffiliations((current) =>
                      current.filter((id) => id !== space.id),
                    )
                  }
                  aria-label={`Remove ${space.name}`}
                >
                  {space.name} <X size={14} />
                </button>
              ))}
          </div>
          <div className="picker-search">
            <Search size={17} />
            <input
              aria-label="Search CampusGroups spaces"
              placeholder="Search classes and clubs"
              value={spaceQuery}
              onChange={(event) => setSpaceQuery(event.target.value)}
            />
          </div>
          <div className="picker-options space-options">
            {catalog.affiliations
              .filter(
                (space) =>
                  !affiliations.includes(space.id) &&
                  normalize(space.name).includes(normalize(spaceQuery)),
              )
              .map((space) => (
                <button
                  type="button"
                  key={space.id}
                  onClick={() =>
                    setAffiliations((current) => [...current, space.id])
                  }
                >
                  + {space.name}
                </button>
              ))}
          </div>
        </section>
        <details className="form-disclosure">
          <summary>
            Contact details <span>Optional</span>
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
          </div>
        </details>
        <section>
          <h2>Choose what travels with your card</h2>
          <p className="muted">
            Your name, photo, and cohort year are always included. You can
            change everything else for each Peerdrop.
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
