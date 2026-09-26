"use client";
import { Shell } from "@/components/shell";
import { Exchange } from "@/components/exchange";
export default function Page() {
  return (
    <Shell>
      <div className="standalone-exchange">
        <header className="page-heading">
          <h1>Meet your next connection.</h1>
        </header>
        <Exchange receiver />
      </div>
    </Shell>
  );
}
