# Messaging Mobile V2 Audit (MVP)

_Date: 2025-11-10_

## Context
- Target experience: Instagram-like mobile messaging with full-screen chat, sticky header, stable composer, and smooth scroll on iOS Safari and Android Chrome.
- Scope covers conversation list, detail view, composer, scroll/auto-scroll handling, media placeholders, gestures, and accessibility polish.
- Feature flag strategy: ship behind `VITE_MESSAGING_MOBILE_V2` (build-time).
- No virtualization in place today; acceptable for MVP unless performance measurements show a need.

## Headlines
- The current mobile conversation route does not respect 100dvh layout semantics, so the body keeps scrolling and the chat header scrolls away on iOS Safari, violating the sticky-header requirement.
- Keyboard handling relies on `visualViewport`, but the root container still uses `min-h-screen` (100vh) and lacks safe-area padding, so the composer can hitch or disappear when the browser chrome collapses/expands.
- The composer textarea is rendered at `text-sm` (≈14px) which forces iOS to zoom the viewport on focus; this is the main cause of the unwanted zoom.
- New incoming messages are marked as read instantly, even when the user is scrolled up reading history. There is no “New messages” affordance and no scroll preservation for history loads.
- Message fetching is unpaginated and unvirtualized, so long threads will regress scroll performance and memory; we should at least add incremental pagination hooks even if we defer virtualization for this MVP.

## Blocking Issues (must fix before PR merge)

1. **Sticky header broken on iOS Safari**  
   - **Symptom**: opening a conversation on mobile and scrolling the history lets the chat header leave the viewport; first message can sit under the header due to overlapping offsets.  
   - **Root cause**: `MessagesPage` renders the immersive mobile layout with `min-h-screen` and no constrained `100dvh` wrapper (`client/src/pages/MessagesPage.tsx`, mobile branch). The scrollable area is the document, not the chat container, so `position: sticky` on the header cannot anchor correctly.  
   - **Fix**: introduce a dedicated full-height (`h-[100dvh]`/CSS `100dvh`) layout when `VITE_MESSAGING_MOBILE_V2` is enabled, wrap chat internals in an overflow-hidden shell, and ensure the internal scroll area owns the scroll.

2. **Composer not keyboard-safe**  
   - **Symptom**: focusing the textarea on iOS Safari or Android Chrome makes the composer jump or lag behind the keyboard when the visual viewport height changes.  
   - **Root cause**: the page still relies on `100vh` geometry (`min-h-screen` on multiple ancestors) so the fixed composer listens to `visualViewport` but the parent height is not recalculated. The safe-area value `--chat-safe-area-bottom` does not include `env(safe-area-inset-bottom)` either, so devices with notches clip the composer. (`client/src/components/ChatWindow.tsx`, visual viewport effect).  
   - **Fix**: switch the immersive container to `height: 100dvh`, add `padding-bottom: calc(env(safe-area-inset-bottom) + var(--chat-viewport-offset))`, and update the `visualViewport` handler to combine real keyboard delta + safe-area. Also swap the fixed composer to `position:sticky` within the dedicated layout so we do not fight the global viewport width when feature flag is off.

3. **iOS zoom-on-focus**  
   - **Symptom**: focusing the message textarea zooms the page.  
   - **Root cause**: the composer textarea uses Tailwind `text-sm` (0.875rem ≈ 14px) (`client/src/components/ChatWindow.tsx`, textarea class). iOS zooms inputs below 16px.  
   - **Fix**: enforce `text-base` (1rem) minimum, ensure line-height ≥ 1.4, and avoid other CSS that might shrink the computed font-size.

4. **Unread & auto-scroll logic incorrect**  
   - **Symptom**: while reading older messages, new incoming messages instantly mark as read and the user loses their place; there is no new-message indicator.  
   - **Root cause**: the realtime insert handler immediately calls `markMessagesAsRead()` (`client/src/components/ChatWindow.tsx`, Supabase channel handler) regardless of scroll position or visibility, and `shouldStickToBottomRef` is only used for scroll anchoring.  
   - **Fix**: gate `markMessagesAsRead` behind a "viewer is at bottom" predicate, track pending unread when the user is scrolled up, and surface a floating “New messages” pill that restores auto-scroll when tapped.

5. **Layout still includes bottom nav when deep-linking without query params**  
   - **Symptom**: navigating directly to `/messages/abc` (or other non-query routes) leaves the `MobileBottomNav` visible, stealing vertical space.  
   - **Root cause**: hide logic in `MobileBottomNav` only checks for `?conversation=` or `?new=` (`client/src/components/MobileBottomNav.tsx`).  
   - **Fix**: align routing with a dedicated `/messages/:id` variant (behind the flag) or expand the hide condition to cover path segments as part of the layout refactor.

## High-Priority UX Gaps

- **Inconsistent spacing/typography in bubbles**: outgoing and incoming bubbles use `text-sm` with tight leading, causing cramped paragraphs. Need consistent spacing scale and helper components (`ChatWindow.tsx`).
- **Initial scroll jump on load**: `scroll-smooth` on the message list plus the immediate `scrollTo({behavior:'auto'|'smooth'})` triggers a perceptible hitch during first paint; we should remove smooth scrolling during the first mount and rely on CSS scroll anchoring for history loads. (`ChatWindow.tsx`, `useEffect` watching `messages`).
- **No scroll preservation when prepending history**: `fetchMessages` pulls the entire table; once we introduce pagination, we need to maintain anchor offset. Right now there's no structure for it.
- **Composer lacks multiline growth**: the textarea is `resize-none` with no auto-height. Long messages become hard to review, hurting the Instagram-level UX. We need an auto-growing textarea with max-height and internal scroll. (`ChatWindow.tsx`).
- **A11y gaps**: the textarea only has a placeholder; there is no explicit label for screen readers. Buttons rely on icons without `aria-label`s in some contexts (list avatars, message actions). Need to confirm color contrast against gradients (especially outgoing bubble timestamps).

## Medium Priority / Polish

- **Conversation list role chips**: inconsistent color palette between list and header (`ConversationList.tsx` vs. `ChatWindow.tsx`). Consolidate into a shared token.
- **No skeleton on immersive view**: when the mobile layout shows only the chat window, the initial state flashes empty content until messages load; add a compact skeleton for conversation header + list.
- **Gesture support**: no back-swipe handler on iOS right now; we rely on the browser back button. Need to wire `history.back()` on edge swipe (React Router `useNavigate(-1)` with `pointer` gesture detection).
- **Media handling placeholders**: there is no reserved height or loader for future image/video messages. Even if we ship text-only for MVP, we should scaffold container styles to avoid future reflow.

## Performance & Reliability Risks

- **Unbounded message fetch**: `supabase.from('messages').select('*')` loads the entire conversation every time. Long threads will increase TTFP and memory usage. Introduce `limit`/`range` pagination and local caching.
- **No virtualization**: acceptable for initial release if pagination keeps the dataset small (<200 messages). We should instrument and revisit; keep `react-virtuoso` on deck if scroll profiling shows dropped frames.
- **Realtime handler duplication**: new events append blindly (`syncMessagesState`), but optimistic IDs are not stripped if Supabase returns duplicate events. Need dedupe by `idempotency_key` or timestamp to avoid double render on flaky connections.
- **Global badge side effects**: `markMessagesAsRead` mutates global badge helpers (`window.__updateUnreadBadge`) even when feature flag is off. Wrap updates so the new layout can run in isolation.

## Proposed Implementation Plan

**PR 1 – Layout & Scroll (behind `VITE_MESSAGING_MOBILE_V2`)**
1. Gate the new mobile messaging shell and route.
2. Build a dedicated layout using `height: 100dvh`, hide global header/bottom nav, and keep the chat header sticky within the internal scroller.
3. Rework scroll container to own scrolling, remove global `scroll-smooth`, and ensure first render uses `scrollTo` without animation.
4. Normalize padding/margins for conversation list and message bubbles, using spacing tokens from `globals.css`.

**PR 2 – Composer & Interaction Polish**
1. Upgrade the composer: `textarea` ≥16px, auto-grow via `ResizeObserver`, explicit label, safe-area padding via `visualViewport + env()`.
2. Refine auto-scroll rules: track whether the user is at the bottom, suppress mark-as-read until the new message is visible, and surface a "New messages" pill with jump-to-latest action.
3. Add optional niceties if time allows: pull-to-load-older scaffold, long-press menu placeholder, media placeholder components.
4. Ensure existing analytics/navigation events continue to fire (reuse existing handlers, add regression tests as needed).

## Testing Notes
- Manual testing matrix: iOS Safari (current + previous), iOS Chrome, Android Chrome, small phones (360px), notched phones (env safe-area), tablets portrait, slow network throttling.
- Key scenarios: long threads (≥200 messages), message send failures (optimistic rollback), unread counts with background/foreground transitions, simultaneous desktop session.
- Verify no iOS zoom, composer pinned, sticky header visible, scroll position preserved, unread badge accurate.

## Next Steps
1. Confirm `VITE_MESSAGING_MOBILE_V2` is available in existing deployments; add fallback defaults.
2. Begin PR 1 implementation focusing on layout container refactor and sticky header fix.
3. Schedule design sync once initial layout draft is ready to lock spacing and typography choices.
