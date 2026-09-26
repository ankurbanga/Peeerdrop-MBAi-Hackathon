import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Affiliation } from "../domain/types";
import { ApiError, checked } from "./db";
import { profileSchema } from "../domain/validation";
import { sanitizeProfileDetails } from "../domain/logic";
export async function getProfile(
  client: SupabaseClient,
  authId: string,
): Promise<Profile | null> {
  const p = checked(
    await client
      .from("profiles")
      .select("*")
      .eq("auth_user_id", authId)
      .maybeSingle(),
  );
  if (!p) return null;
  const links =
    checked(
      await client
        .from("profile_affiliations")
        .select("affiliation_id")
        .eq("profile_id", p.id),
    ) ?? [];
  const affiliations = links.length
    ? checked(
        await client
          .from("affiliations")
          .select("*")
          .in(
            "id",
            links.map((x) => x.affiliation_id),
          ),
      )
    : [];
  return {
    ...p,
    details: sanitizeProfileDetails(p.details ?? {}),
    default_share_fields: (p.default_share_fields ?? []).filter(
      (field: string) => field !== "movies" && field !== "relationshipStatus",
    ),
    affiliations,
  } as Profile;
}
export async function requireProfile(client: SupabaseClient, authId: string) {
  const p = await getProfile(client, authId);
  if (!p)
    throw new ApiError(409, "PROFILE_REQUIRED", "Create your card first.");
  return p;
}
export async function saveProfile(
  client: SupabaseClient,
  authId: string,
  input: unknown,
) {
  const v = profileSchema.parse(input);
  const ids = [...new Set(v.affiliationIds)];
  const affiliations = ids.length
    ? (checked(await client.from("affiliations").select("*").in("id", ids)) ??
      [])
    : [];
  if (affiliations.length !== ids.length)
    throw new ApiError(
      400,
      "INVALID_AFFILIATION",
      "Choose a class or club from the list.",
    );
  const existing = await getProfile(client, authId);
  const saved = checked(
    await client
      .from("profiles")
      .upsert(
        {
          ...(existing ? { id: existing.id } : {}),
          auth_user_id: authId,
          display_name: v.displayName,
          graduation_year: v.graduationYear,
          avatar_url:
            existing?.avatar_url ??
            (process.env.DEMO_MODE === "true"
              ? "/avatars/default-profile.png"
              : null),
          details: v.details,
          default_share_fields: v.defaultShareFields,
          graph_visible: v.graphVisible,
          is_demo: false,
        },
        { onConflict: "auth_user_id" },
      )
      .select("*")
      .single(),
  );
  // Upsert before deleting removed affiliations so concurrent reads never see an empty replacement set.
  if (ids.length)
    checked(
      await client
        .from("profile_affiliations")
        .upsert(
          ids.map((id) => ({ profile_id: saved.id, affiliation_id: id })),
        ),
    );
  const old = existing?.affiliations.filter((a) => !ids.includes(a.id)) ?? [];
  if (old.length)
    checked(
      await client
        .from("profile_affiliations")
        .delete()
        .eq("profile_id", saved.id)
        .in(
          "affiliation_id",
          old.map((a) => a.id),
        ),
    );
  return { ...saved, affiliations: affiliations as Affiliation[] } as Profile;
}
