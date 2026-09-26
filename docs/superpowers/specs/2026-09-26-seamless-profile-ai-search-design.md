# Seamless profile and AI search design

Peerdrop should feel pre-connected to Kellogg and require almost no setup before a reciprocal exchange. CampusGroups spaces and the Kellogg directory are simulated demo integrations and are labeled as such.

## Profile

- Require name and graduation year; assign the default demo identity a bundled fictional directory headshot.
- Replace the shared-space checklist with searchable class/club selection and removable bubbles.
- Replace comma-separated hobbies with searchable suggested hobbies, removable bubbles, and custom entries.
- Remove movies and relationship status from current profiles, sharing controls, retrieval, and rendering. Legacy snapshots may retain them but the app does not expose them.

## Exchange

Opening Peerdrop immediately creates and displays a QR from saved defaults. “Change what I’m sharing” reveals per-exchange controls. Changing a field cancels and replaces the open invite after a short debounce; the replacement snapshot and QR remain consistent. One-time changes do not overwrite profile defaults.

## AI search

“Ask Peerdrop” is an explicit mode beside normal search. It searches only direct connections and only data authorized for the viewer: shared card fields, meeting context, shared memories, and the viewer’s private reminder. The server sends a bounded candidate set to a server-configured OpenAI-compatible chat endpoint, validates returned connection IDs, and returns concise reasons. Missing credentials, invalid output, or timeout uses a labeled deterministic fallback. Hidden fields, contact methods, and second-degree people are excluded.

## Quality and privacy

All controls work at 390px, meet 44px touch targets, and remain keyboard accessible. Model and directory integrations are labeled demo behavior. Tests cover profile selection, automatic/replaced QR generation, candidate privacy, invalid model output, fallback ranking, and mobile/desktop flows.
