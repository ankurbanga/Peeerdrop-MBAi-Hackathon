"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import type { Profile, Affiliation } from "@/lib/domain/types";
import { api, configured } from "@/lib/client";
import { ArrowRight, RefreshCw, Unplug } from "lucide-react";
const Context = createContext<{
  profile: Profile | null;
  reload: () => Promise<void>;
  catalog: { affiliations: Affiliation[]; venues: string[] };
} | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [catalog, setCatalog] = useState<{
      affiliations: Affiliation[];
      venues: string[];
    }>({ affiliations: [], venues: [] }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const router = useRouter(),
    pathname = usePathname();
  const reload = useCallback(async () => {
    const p = await api<Profile | null>("/me");
    setProfile(p);
  }, []);
  const boot = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        api<Profile | null>("/me"),
        api<typeof catalog>("/catalog"),
      ]);
      setProfile(p);
      setCatalog(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (location.hash.startsWith("#token=")) {
      sessionStorage.setItem("peerdrop-invite", location.hash.slice(7));
      history.replaceState(null, "", location.pathname);
    }
    if (configured()) void boot();
    else setLoading(false);
  }, [boot]);
  useEffect(() => {
    if (
      !loading &&
      !error &&
      configured() &&
      !profile &&
      pathname !== "/onboarding"
    )
      router.replace("/onboarding");
  }, [loading, error, profile, pathname, router]);
  if (!configured())
    return (
      <main className="setup-screen">
        <div className="brand">
          <Logo /> peerdrop
        </div>
        <div className="setup-copy">
          <Unplug size={36} />
          <h1>
            Your people.
            <br />
            One connection away.
          </h1>
          <p>
            The app is ready for its shared backend. Connect Supabase to create
            your card and start exchanging.
          </p>
          <ol>
            <li>Create a Supabase project and enable anonymous sign-ins.</li>
            <li>
              Run the SQL migration in <code>supabase/migrations</code>.
            </li>
            <li>
              Copy <code>.env.example</code> to <code>.env.local</code> and add
              your project credentials.
            </li>
            <li>Restart the app. The README includes deployment steps.</li>
          </ol>
          <div className="notice">
            No contacts are stored or simulated in this setup screen.
          </div>
        </div>
        <span className="setup-footer">
          Remember the person. Restart the conversation.{" "}
          <ArrowRight size={16} />
        </span>
      </main>
    );
  if (loading)
    return (
      <main className="center-state">
        <Logo />
        <p>Getting your people ready…</p>
      </main>
    );
  if (error)
    return (
      <main className="center-state">
        <Unplug />
        <h1>Let’s reconnect</h1>
        <p role="alert">{error}</p>
        <button className="primary" onClick={boot}>
          <RefreshCw size={16} />
          Try again
        </button>
      </main>
    );
  return (
    <Context.Provider value={{ profile, reload, catalog }}>
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const c = useContext(Context);
  if (!c) throw new Error("Session missing");
  return c;
}
export function Logo() {
  return (
    <svg
      aria-hidden="true"
      width="30"
      height="32"
      viewBox="0 0 30 32"
      fill="none"
    >
      <path
        d="M15 2C15 2 4 13 4 20a11 11 0 0 0 22 0C26 13 15 2 15 2Z"
        fill="currentColor"
      />
      <circle cx="11" cy="20" r="2" fill="white" />
      <circle cx="19" cy="20" r="2" fill="white" />
      <path d="M11 25h8" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
