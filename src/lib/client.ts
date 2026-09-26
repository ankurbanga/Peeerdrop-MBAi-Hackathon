"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
let sessionPromise: Promise<string> | null = null;
export function configured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
    key &&
    url !== "https://YOUR_PROJECT.supabase.co" &&
    key !== "YOUR_ANON_KEY",
  );
}
export function supabase() {
  if (!configured())
    throw new Error(
      "Supabase setup is required. Follow the README to connect your project.",
    );
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ));
}
async function accessToken() {
  if (!sessionPromise)
    sessionPromise = (async () => {
      const auth = supabase().auth;
      const { data, error } = await auth.getSession();
      if (error) throw error;
      if (data.session) return data.session.access_token;
      const result = await auth.signInAnonymously();
      if (result.error) throw result.error;
      return result.data.session!.access_token;
    })().finally(() => {
      sessionPromise = null;
    });
  return sessionPromise;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await accessToken();
  const result = await fetch(`/api${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const body = await result.json();
  if (!result.ok)
    throw new Error(body.error?.message ?? "Could not connect. Please retry.");
  return body as T;
}
export const send = <T>(path: string, body: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });
