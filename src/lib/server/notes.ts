import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Note } from "../domain/types";
import { ApiError, checked } from "./db";
import { authorizedConnection } from "./network";

const publicNote = (n: any): Note => ({
  id: n.id,
  author_id: n.author_id,
  visibility: n.visibility,
  body: n.body,
  created_at: n.created_at,
});

export async function saveNote(
  client: SupabaseClient,
  authId: string,
  connectionId: string,
  input: { visibility: "private" | "shared"; body: string },
) {
  const { profile } = await authorizedConnection(client, authId, connectionId);
  if (input.visibility === "shared") {
    const row = checked(
      await client
        .from("notes")
        .insert({
          connection_id: connectionId,
          author_id: profile.id,
          visibility: "shared",
          body: input.body,
        })
        .select("*")
        .single(),
    );
    return publicNote(row);
  }
  const previous = checked(
    await client
      .from("notes")
      .select("*")
      .eq("connection_id", connectionId)
      .eq("author_id", profile.id)
      .eq("visibility", "private")
      .maybeSingle(),
  );
  if (previous) {
    const row = checked(
      await client
        .from("notes")
        .update({ body: input.body })
        .eq("id", previous.id)
        .select("*")
        .single(),
    );
    return publicNote(row);
  }
  const { data, error } = await client
    .from("notes")
    .insert({
      connection_id: connectionId,
      author_id: profile.id,
      visibility: "private",
      body: input.body,
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const raced = checked(
      await client
        .from("notes")
        .select("id")
        .eq("connection_id", connectionId)
        .eq("author_id", profile.id)
        .eq("visibility", "private")
        .single(),
    );
    if (!raced)
      throw new ApiError(
        500,
        "DATABASE_ERROR",
        "Could not save this note. Please retry.",
      );
    return publicNote(
      checked(
        await client
          .from("notes")
          .update({ body: input.body })
          .eq("id", raced.id)
          .select("*")
          .single(),
      ),
    );
  }
  if (error) checked({ data: null, error });
  return publicNote(data);
}

export async function editNote(
  client: SupabaseClient,
  authId: string,
  noteId: string,
  body: string,
) {
  const found = checked(
    await client.from("notes").select("*").eq("id", noteId).maybeSingle(),
  );
  if (!found)
    throw new ApiError(404, "NOT_FOUND", "This note could not be found.");
  const { profile } = await authorizedConnection(
    client,
    authId,
    found.connection_id,
  );
  if (found.author_id !== profile.id)
    throw new ApiError(404, "NOT_FOUND", "This note could not be found.");
  const row = checked(
    await client
      .from("notes")
      .update({ body })
      .eq("id", noteId)
      .select("*")
      .single(),
  );
  return publicNote(row);
}

export async function deleteNote(
  client: SupabaseClient,
  authId: string,
  noteId: string,
) {
  const found = checked(
    await client.from("notes").select("*").eq("id", noteId).maybeSingle(),
  );
  if (!found)
    throw new ApiError(404, "NOT_FOUND", "This note could not be found.");
  const { profile } = await authorizedConnection(
    client,
    authId,
    found.connection_id,
  );
  if (found.author_id !== profile.id)
    throw new ApiError(404, "NOT_FOUND", "This note could not be found.");
  checked(await client.from("notes").delete().eq("id", noteId));
  return { deleted: true, id: noteId };
}
