import { ZodError } from "zod";
import { ApiError, actor } from "@/lib/server/db";
import { getProfile, saveProfile } from "@/lib/server/profiles";
import {
  acceptExchange,
  cancelExchange,
  createExchange,
  getExchange,
  previewExchange,
  requestExchange,
} from "@/lib/server/exchanges";
import { getConnectionDetail, getNetwork } from "@/lib/server/network";
import { deleteNote, editNote, saveNote } from "@/lib/server/notes";
import { getCatalog, listEvents, setEventInterest } from "@/lib/server/events";
import { ensureDemoFixtures } from "@/lib/server/fixtures";
import {
  createExchangeSchema,
  interestSchema,
  noteEditSchema,
  noteSchema,
  profileSchema,
  requestExchangeSchema,
  uuidSchema,
} from "@/lib/domain/validation";

const noStore = { "Cache-Control": "no-store, max-age=0" };
const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(data, { status, headers });
const readError = {
  error: {
    code: "BAD_REQUEST",
    message: "The request body must be valid JSON.",
  },
};

async function body(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", readError.error.message);
  }
}
function requireMethod(ok: boolean) {
  if (!ok)
    throw new ApiError(
      405,
      "METHOD_NOT_ALLOWED",
      "This method is not supported for this endpoint.",
    );
}
function pathUuid(value: string) {
  try {
    return uuidSchema.parse(value);
  } catch {
    throw new ApiError(404, "NOT_FOUND", "This item could not be found.");
  }
}

async function handle(request: Request, parts: string[]) {
  const { client, authId } = await actor(request);
  const method = request.method.toUpperCase();
  if (parts.length === 1 && parts[0] === "me") {
    if (method === "GET")
      return json(await getProfile(client, authId), 200, noStore);
    requireMethod(method === "PUT");
    const input = profileSchema.parse(await body(request));
    const saved = await saveProfile(client, authId, input);
    if (process.env.DEMO_MODE === "true")
      await ensureDemoFixtures(client, saved);
    return json(saved);
  }
  if (parts.length === 1 && parts[0] === "catalog") {
    requireMethod(method === "GET");
    return json(await getCatalog(client), 200, noStore);
  }
  if (parts[0] === "exchanges") {
    if (parts.length === 1) {
      requireMethod(method === "POST");
      const input = createExchangeSchema.parse(await body(request));
      return json(await createExchange(client, authId, input), 201);
    }
    if (parts.length === 2 && parts[1] === "preview") {
      requireMethod(method === "GET");
      const token = new URL(request.url).searchParams.get("token") ?? "";
      if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw new ApiError(
          400,
          "BAD_REQUEST",
          "This Peerdrop link is invalid.",
        );
      const profile = await getProfile(client, authId);
      return json(
        await previewExchange(client, token, profile?.id ?? ""),
        200,
        noStore,
      );
    }
    if (parts.length === 2 && parts[1] === "request") {
      requireMethod(method === "POST");
      const input = requestExchangeSchema.parse(await body(request));
      return json(await requestExchange(client, authId, input), 201);
    }
    if (parts.length === 2) {
      const id = pathUuid(parts[1]);
      if (method === "GET")
        return json(await getExchange(client, authId, id), 200, noStore);
      throw new ApiError(
        405,
        "METHOD_NOT_ALLOWED",
        "This method is not supported for this endpoint.",
      );
    }
    if (parts.length === 3) {
      const id = pathUuid(parts[1]);
      if (parts[2] === "accept") {
        requireMethod(method === "POST");
        return json(await acceptExchange(client, authId, id));
      }
      if (parts[2] === "cancel") {
        requireMethod(method === "POST");
        return json(await cancelExchange(client, authId, id));
      }
    }
  }
  if (parts.length === 1 && parts[0] === "network") {
    requireMethod(method === "GET");
    return json(await getNetwork(client, authId), 200, noStore);
  }
  if (parts.length === 2 && parts[0] === "connections") {
    requireMethod(method === "GET");
    return json(
      await getConnectionDetail(client, authId, pathUuid(parts[1])),
      200,
      noStore,
    );
  }
  if (
    parts.length === 3 &&
    parts[0] === "connections" &&
    parts[2] === "notes"
  ) {
    requireMethod(method === "POST");
    const input = noteSchema.parse(await body(request));
    return json(await saveNote(client, authId, pathUuid(parts[1]), input), 201);
  }
  if (parts.length === 2 && parts[0] === "notes") {
    const id = pathUuid(parts[1]);
    if (method === "PATCH") {
      const input = noteEditSchema.parse(await body(request));
      return json(await editNote(client, authId, id, input.body));
    }
    if (method === "DELETE") return json(await deleteNote(client, authId, id));
    throw new ApiError(
      405,
      "METHOD_NOT_ALLOWED",
      "This method is not supported for this endpoint.",
    );
  }
  if (parts.length === 1 && parts[0] === "events") {
    requireMethod(method === "GET");
    const forYou = new URL(request.url).searchParams.get("forYou") === "true";
    return json(await listEvents(client, authId, forYou), 200, noStore);
  }
  if (parts.length === 3 && parts[0] === "events" && parts[2] === "interest") {
    requireMethod(method === "PUT");
    const input = interestSchema.parse(await body(request));
    return json(
      await setEventInterest(client, authId, pathUuid(parts[1]), input),
    );
  }
  throw new ApiError(404, "NOT_FOUND", "This endpoint could not be found.");
}

async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path = [] } = await context.params;
    return await handle(request, path);
  } catch (error) {
    if (error instanceof ApiError)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
        request.method === "GET" ? noStore : undefined,
      );
    if (error instanceof ZodError)
      return json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Check the fields and try again.",
          },
        },
        400,
        request.method === "GET" ? noStore : undefined,
      );
    return json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong. Please retry.",
        },
      },
      500,
      request.method === "GET" ? noStore : undefined,
    );
  }
}

export const GET = route;
export const POST = route;
export const PUT = route;
export const PATCH = route;
export const DELETE = route;
