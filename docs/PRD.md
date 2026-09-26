# Peerdrop — Product requirements

Version 1.0 · September 26, 2026 · Hackathon MVP

This document replaces the initial conversational plan. Latest decisions take precedence: graph-first home, search and filters, a separate Events tab, and a real exchange on two phones. Implementation defaults are specified in TECHNICAL_SPEC.md; commercial hypotheses are in BUSINESS_PITCH.md.

## 1. Problem and intended outcome

New Kellogg students meet more people during their first weeks than they can comfortably remember. Conversations cover hometowns, previous work, hobbies, and shared spaces, but names and context blur together. Students often forget to exchange contact information and may not even remember where they met someone.

Peerdrop helps students preserve an introduction, remember the person through fragments, and find a natural way to reconnect.

**Product promise:** Remember the person. Restart the conversation.

Primary audience: new Kellogg students during orientation and the first quarter. The MVP serves social and professional relationships without requiring users to choose between them. Student/JV affiliation and partner linking are not MVP requirements.

Success is an end-to-end journey: exchange with consent → later find someone from incomplete memories → recognize shared context → use an available contact or event link to reconnect.

## 2. Experience and navigation

### Network — the home screen

- Top: “Your people,” search input with “Name, hobby, industry, anything…”, and filter chips.
- Main canvas: the current user at the center, contacts represented by photos or initials and first names. All direct contacts are accessible; the initial camera frames the most recent 12 and a “Fit everyone” action reveals the full graph.
- Direct links connect the user to their contacts. Subtle additional links connect contacts who have also exchanged, subject to mutual visibility consent.
- Search highlights matches and fades other nodes. A compact results sheet lists matching faces, details, and meeting context so navigation never depends on locating a tiny node.
- Filters: class, club, event, hometown, previous industry, meeting venue, and meeting date range. Search and filters combine.
- A compact network snapshot shows percentage of the 650-person cohort connected, first-degree connections, direct connections in the year ahead, and the viewer’s private close network. Filtering removes nonmatches from both graph and list.
- A prominent “Peerdrop” button opens the exchange flow.
- Bottom navigation: Network · Events · Me.
- New users see their own node and “Meet someone? Make your first Peerdrop.” Provide loading, offline/retry, and no-results states.

### Person detail sheet

Tapping a node or search result opens the same sheet. Prioritize face/name, date and place met, shared memories, the viewer’s private reminder, common classes/clubs/events, other shared profile details, then contact actions. Never render empty fields or information withheld during the exchange.

### Events

Show a curated list of upcoming sample events, with title, date, venue, interests/club tags, and an external Partiful or CampusGroups link when available. Clearly label fictional sample events. Let users mark “Interested” and separately choose “Share my interest with connections,” off by default. Do not label interest as attendance or RSVP.

Highlight relevance using overlapping class/club/interest tags. Show interested connections only if they explicitly shared that signal. Open real external URLs; do not pretend to import accounts, register attendance, or send invitations.

### Me

Edit personal card, default sharing choices, classes/clubs, and the “Show my connections to mutual contacts” setting. Explain that profile edits apply to future exchanges in this prototype. Show that the demo identity is saved on this browser and account recovery is not available.

## 3. Functional requirements

### Profile and sharing

- Require display name and graduation year. Name, available photo, and graduation year are identity fields shared in every exchange. Optional photo uses initials as a fallback.
- Optional fields: hometown, previous industry, hobbies, fun fact, phone, Instagram, LinkedIn, and email.
- Hobbies use searchable common suggestions, removable skill-like bubbles, and custom entries.
- Classes and clubs are searchable shared-space selections from a seeded catalog labeled as a simulated CampusGroups source. They are self-selected, not verified membership or enrollment.
- Use one default card with individually selectable extras, not professional/personal presets. Name and available photo are identity fields; all additional categories require selection.
- Contact methods start unselected. Store default choices, and permit changes for each exchange.
- A viewer can privately favorite a direct connection. Favorites are never shared with the other participant.

### Reciprocal exchange

1. Tapping Peerdrop immediately generates a short-lived QR/link using saved defaults. “Change what I’m sharing” permits per-exchange field/venue/event changes and seamlessly replaces the QR without changing saved defaults.
2. Receiver opens it through the phone camera. Existing users continue; new users enter a name and optionally add details before continuing. Preserve the exchange link during onboarding.
3. Receiver sees only the initiator’s name/photo, previews their own outgoing card, and submits an exchange request.
4. Initiator sees the receiver’s name/photo and confirms this specific person. Only then are both selected snapshots released and the connection saved.
5. Both phones show success and optional memory actions. Duplicate exchanges open the existing connection. Expired, cancelled, or interrupted requests show clear recovery actions.

The final confirmation prevents anyone with a forwarded QR link from silently receiving personal details. Accepting an exchange is distinct from allowing mutual contacts to see its existence.

### Meeting memory and location

- Record the accepted exchange time automatically. Save an optional shared venue/event selected by the initiator, visible before acceptance.
- MVP: quick venue list plus manual entry. No background tracking, geolocation prompt, coordinates, or reverse-geocoding dependency.
- Future: permission-based, one-time nearby venue suggestions that users confirm.
- After acceptance, prompt “What will help you remember them?” with a private reminder as the default action and a separate “Share a memory” action.
- Private reminder: one editable note per person per connection, visible only to its author.
- Shared memories: attributed entries; either party adds them, but only the author edits/deletes their own. No second approval step.

### Retrieval, graph, and common context

- Regular search covers names, received profile snapshots, meeting context, shared memories, and the viewer’s own private notes using case-insensitive word fragments.
- An explicit “Ask Peerdrop” mode accepts natural-language questions such as “Who should I invite to a board gaming party?” It ranks direct connections only, explains each suggestion, sends only already-authorized fields to a server-side model endpoint, validates returned connection IDs, and uses deterministic local matching when the model is unavailable.
- Classes/clubs in common compare the viewer’s current selections with the contact’s shared snapshot. Events in common use explicitly shared current interest signals.
- Only show the user and direct contacts. No strangers, second-degree profiles, or implied introductions.
- Show a link between two contacts only when a real accepted connection exists and both endpoints currently opted into mutual-contact visibility. Off by default; switching off removes such links on refresh.
- Mutual-contact counts use only these visible links. Do not leak hidden relationships through counts, search, or event cards.

## 4. Scope and priorities

All are required for the planned demo: real two-phone exchange and persistence; selective sharing; graph with consented links; fragment search and filters; person detail with private/shared notes; manual venue capture; common classes/clubs; a separate Events tab with manual interest and external links; editable profile.

Keep the presentation simple if time is tight. Use bundled realistic-but-fictional headshots for demo contacts and initials when no photo is available; photo upload remains out of scope. Native camera QR scanning avoids an in-app camera dependency. Use seeded catalog data and fictional contacts with an explicit demo label.

Defer live Partiful/CampusGroups syncing, automated venue detection, native AirDrop/Bluetooth, in-app messaging, notifications, calendar integration, industry-contact directories, second-degree discovery, payments, school dashboards, and production account recovery.

## 5. Demo and acceptance criteria

Prepare two real browser identities and fictional contacts. Both identities are connected to one shared fictional contact. Each identity must explicitly enable mutual-contact visibility for the triangle demonstration.

Demo: exchange on two phones → save “Loves cooperative board games” → ask who to invite to game night → open the suggested person → see meeting venue and a common class → inspect the consented triangle → open a relevant event or shared contact link.

- Accepted connection appears on both phones within five seconds on a healthy network and survives refresh.
- Before final acceptance, neither recipient can fetch the other’s selected private profile fields.
- Withheld fields never appear in contact responses, search, or UI.
- Private reminders cannot be fetched by the other participant or a third user.
- Shared memories are visible to both parties and editable only by their author.
- Graph links and derived counts disappear when either endpoint disables visibility.
- Search finds fragments across fields; filters and clear/reset actions work on phones.
- Event interest is visible to contacts only after explicit sharing; never presented as attendance.
- Repeated acceptance does not duplicate connections; expired links and network failures are recoverable.
- Core screens work at 390-pixel width without horizontal page overflow. A results list makes graph information accessible without gesture navigation.

Pilot measures after the hackathon: completed exchanges, successful recall tasks, return visits, contact-link use, and self-reported follow-up/belonging. Contact-link clicks alone do not prove a relationship deepened. No pilot results or willingness-to-pay claims are established yet.
