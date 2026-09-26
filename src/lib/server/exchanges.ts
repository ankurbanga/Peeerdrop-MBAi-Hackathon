import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExchangeState, SharedCard } from "../domain/types";
import { makeCard } from "../domain/logic";
import { ApiError, checked } from "./db";
import { requireProfile } from "./profiles";

const INVITE_TTL_MS = 15 * 60 * 1000;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

function rpcError(error: any): never {
  const message = String(error?.message ?? "").toUpperCase();
  const status = message.includes("EXPIRED")
    ? 410
    : message.includes("FORBIDDEN")
      ? 403
      : message.includes("NOT_FOUND")
        ? 404
        : message.includes("CONFLICT")
          ? 409
          : 500;
  const code =
    status === 410
      ? "EXPIRED"
      : status === 403
        ? "FORBIDDEN"
        : status === 404
          ? "NOT_FOUND"
          : status === 409
            ? "CONFLICT"
            : "DATABASE_ERROR";
  const messageForUser =
    status === 410
      ? "This Peerdrop link has expired."
      : status === 403
        ? "You cannot perform this action."
        : status === 404
          ? "This Peerdrop could not be found."
          : status === 409
            ? "This Peerdrop can no longer be changed."
            : "Could not complete this exchange. Please retry.";
  throw new ApiError(status, code, messageForUser);
}

function identity(snapshot: any) {
  return {
    id: snapshot?.id,
    displayName: snapshot?.displayName ?? "Peerdrop contact",
    avatarUrl: snapshot?.avatarUrl ?? null,
    graduationYear: snapshot?.graduationYear,
  };
}

function stateFor(row: any, actorId: string): ExchangeState {
  const isInitiator = row.initiator_id === actorId;
  const ownSnapshot = (
    isInitiator ? row.initiator_snapshot : row.receiver_snapshot
  ) as SharedCard | null;
  if (!ownSnapshot)
    throw new ApiError(
      409,
      "PROFILE_REQUIRED",
      "Create your card before continuing.",
    );
  const counterpartSnapshot = isInitiator
    ? row.receiver_snapshot
    : row.initiator_snapshot;
  return {
    id: row.id,
    status: row.status,
    expiresAt: row.expires_at,
    venue: row.venue,
    connectionId: row.connection_id,
    counterpart: counterpartSnapshot ? identity(counterpartSnapshot) : null,
    isInitiator,
    ownSnapshot,
  };
}

async function ownsExchange(
  client: SupabaseClient,
  exchangeId: string,
  profileId: string,
) {
  const row = checked(
    await client
      .from("exchanges")
      .select("*")
      .eq("id", exchangeId)
      .maybeSingle(),
  );
  if (!row)
    throw new ApiError(404, "NOT_FOUND", "This Peerdrop could not be found.");
  if (row.initiator_id !== profileId && row.receiver_id !== profileId)
    throw new ApiError(404, "NOT_FOUND", "This Peerdrop could not be found.");
  return row;
}

export async function createExchange(
  client: SupabaseClient,
  authId: string,
  input: { shareFields: any[]; venue?: string; eventId?: string },
) {
  const profile = await requireProfile(client, authId);
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base)
    throw new ApiError(
      503,
      "SETUP_REQUIRED",
      "Set NEXT_PUBLIC_APP_URL to create a share link.",
    );
  let appUrl: URL;
  try {
    appUrl = new URL(base);
  } catch {
    throw new ApiError(
      503,
      "SETUP_REQUIRED",
      "Set NEXT_PUBLIC_APP_URL to a valid application URL.",
    );
  }
  if (
    appUrl.protocol !== "https:" &&
    appUrl.hostname !== "localhost" &&
    appUrl.hostname !== "127.0.0.1"
  )
    throw new ApiError(
      503,
      "SETUP_REQUIRED",
      "The application URL must use HTTPS.",
    );
  if (input.eventId) {
    const event = checked(
      await client
        .from("events")
        .select("id")
        .eq("id", input.eventId)
        .maybeSingle(),
    );
    if (!event)
      throw new ApiError(
        400,
        "INVALID_EVENT",
        "Choose an event from the list.",
      );
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  const snapshot = makeCard(profile, input.shareFields);
  const inserted = checked(
    await client
      .from("exchanges")
      .insert({
        token_hash: sha256(token),
        initiator_id: profile.id,
        expires_at: expiresAt,
        initiator_snapshot: snapshot,
        venue: input.venue || null,
        event_id: input.eventId || null,
      })
      .select("id,expires_at")
      .single(),
  );
  return {
    id: inserted!.id,
    url: `${appUrl.origin}/exchange#token=${token}`,
    expiresAt: inserted!.expires_at,
  };
}

export async function previewExchange(
  client: SupabaseClient,
  token: string,
  profileId: string | null,
) {
  const row = checked(
    await client
      .from("exchanges")
      .select(
        "id,token_hash,initiator_id,receiver_id,status,expires_at,initiator_snapshot,venue,event_id",
      )
      .eq("token_hash", sha256(token))
      .maybeSingle(),
  );
  if (!row)
    throw new ApiError(
      404,
      "NOT_FOUND",
      "This Peerdrop link could not be found.",
    );
  if (profileId && row.initiator_id === profileId)
    throw new ApiError(
      409,
      "CONFLICT",
      "Open this Peerdrop on the other person’s device.",
    );
  if (row.status === "cancelled")
    throw new ApiError(409, "CONFLICT", "This Peerdrop was cancelled.");
  if (row.status !== "accepted" && Date.parse(row.expires_at) <= Date.now())
    throw new ApiError(410, "EXPIRED", "This Peerdrop link has expired.");
  if (row.receiver_id && row.receiver_id !== profileId)
    throw new ApiError(
      409,
      "CONFLICT",
      "This Peerdrop link has already been claimed.",
    );
  const initiator = identity(row.initiator_snapshot);
  return {
    id: row.id,
    initiator,
    venue: row.venue,
    eventId: row.event_id,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

export async function requestExchange(
  client: SupabaseClient,
  authId: string,
  input: { token: string; shareFields: any[] },
) {
  const profile = await requireProfile(client, authId);
  const snapshot = makeCard(profile, input.shareFields);
  const { data, error } = await client
    .rpc("request_exchange", {
      p_token_hash: sha256(input.token),
      p_actor: profile.id,
      p_snapshot: snapshot,
    })
    .single();
  if (error) rpcError(error);
  const exchange = data as any;
  return { id: exchange.id, status: exchange.status };
}

export async function getExchange(
  client: SupabaseClient,
  authId: string,
  exchangeId: string,
) {
  if (!isUuid(exchangeId))
    throw new ApiError(404, "NOT_FOUND", "This Peerdrop could not be found.");
  const profile = await requireProfile(client, authId);
  const row = await ownsExchange(client, exchangeId, profile.id);
  return stateFor(row, profile.id);
}

export async function acceptExchange(
  client: SupabaseClient,
  authId: string,
  exchangeId: string,
) {
  if (!isUuid(exchangeId))
    throw new ApiError(404, "NOT_FOUND", "This Peerdrop could not be found.");
  const profile = await requireProfile(client, authId);
  const { data, error } = await client
    .rpc("accept_exchange", { p_exchange_id: exchangeId, p_actor: profile.id })
    .single();
  if (error) rpcError(error);
  return { connectionId: (data as any).connection_id };
}

export async function cancelExchange(
  client: SupabaseClient,
  authId: string,
  exchangeId: string,
) {
  if (!isUuid(exchangeId))
    throw new ApiError(404, "NOT_FOUND", "This Peerdrop could not be found.");
  const profile = await requireProfile(client, authId);
  const { data, error } = await client
    .rpc("cancel_exchange", { p_exchange_id: exchangeId, p_actor: profile.id })
    .single();
  if (error) rpcError(error);
  return stateFor(data, profile.id);
}
