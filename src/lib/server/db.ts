import "server-only";
import { createClient } from "@supabase/supabase-js";
export function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new ApiError(
      503,
      "SETUP_REQUIRED",
      "Connect Supabase to enable Peerdrop. See README setup steps.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function checked<T>(r: { data: T; error: unknown }): T {
  if (r.error)
    throw new ApiError(
      500,
      "DATABASE_ERROR",
      "Could not save or load this data. Please retry.",
    );
  return r.data;
}
export async function actor(request: Request) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token)
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Your session is missing. Reload to reconnect.",
    );
  const client = db();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new ApiError(
      401,
      "UNAUTHENTICATED",
      "Your session expired. Reload to reconnect.",
    );
  return { client, authId: data.user.id };
}
