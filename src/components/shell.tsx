"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Network,
  CalendarDays,
  UserRound,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import { Logo, useSession } from "./session";
import { Avatar, Sheet } from "./ui";
import { Exchange } from "./exchange";
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname(),
    { profile } = useSession(),
    [exchange, setExchange] = useState(false);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Logo />
          peerdrop
        </Link>
        <div className="sidebar-intro">
          A little context.
          <br />A lasting connection.
        </div>
        <nav aria-label="Main navigation">
          {[
            ["/", "Network", Network],
            ["/events", "Events", CalendarDays],
            ["/me", "Me", UserRound],
          ].map(([href, label, Icon]) => {
            const I = Icon as typeof Network;
            return (
              <Link
                key={href as string}
                href={href as string}
                className={path === href ? "active" : ""}
              >
                <I size={21} />
                <span>{label as string}</span>
              </Link>
            );
          })}
        </nav>
        <button
          className="primary drop-button"
          onClick={() => setExchange(true)}
        >
          <Plus size={20} />
          Peerdrop
        </button>
        <div className="sidebar-bottom">
          <div className="quiet-copy">
            Good connections start
            <br />
            with a hello.
            <ArrowUpRight size={18} />
          </div>
          {profile && (
            <Link href="/me" className="current-user">
              <Avatar
                name={profile.display_name}
                src={profile.avatar_url}
                size="small"
              />
              <span>
                {profile.display_name}
                <small>Your personal card</small>
              </span>
            </Link>
          )}
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <button className="mobile-drop primary" onClick={() => setExchange(true)}>
        <Plus size={20} />
        Peerdrop
      </button>
      {exchange && (
        <Sheet title="Make a Peerdrop" onClose={() => setExchange(false)}>
          <Exchange onDone={() => setExchange(false)} />
        </Sheet>
      )}
    </div>
  );
}
