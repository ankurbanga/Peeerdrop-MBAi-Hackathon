import type { Metadata } from "next";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "./globals.css";
import { SessionProvider } from "@/components/session";
export const metadata: Metadata = {
  title: "Peerdrop — Your people, remembered",
  description: "Remember the person. Restart the conversation.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // Browser extensions may add attributes to the document root before hydration.
    // Keep this exception at the root; descendants retain hydration checks.
    <html lang="en" suppressHydrationWarning>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
