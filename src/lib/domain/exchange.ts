export function exchangeExpired(
  state: { status: string; expiresAt: string },
  now: number,
) {
  return (
    (state.status === "open" || state.status === "requested") &&
    Date.parse(state.expiresAt) <= now
  );
}
