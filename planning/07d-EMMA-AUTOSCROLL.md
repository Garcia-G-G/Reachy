# 07d — Emma · Auto-scroll while streaming

> Attach `planning/prompts/00-CONTEXT.md` AND `planning/07-PROJECT-CHAT-COPILOT.md`. Apply §0.10. **Surgical UX fix.** The chat doesn't follow as Emma types — user has to manually scroll to see the latest tokens. Fix the standard ChatGPT/Claude pattern: stick-to-bottom while streaming, but respect user's scroll intent if they've scrolled up.

---

## 🚨 Directive to CCM

This is mechanical. Don't over-engineer.

- **One scroll container.** The chat message list. Identify it via `grep -n 'overflow-y\|messages' src/components/app/emma-chat.tsx` (or the message list component).
- **Stick-to-bottom WHEN user is at bottom.** If they manually scroll up to re-read something, DO NOT yank them back down. That's the most annoying chat-UX antipattern. Show a `↓ nuevos mensajes` pill at the bottom-right of the chat region; click → smooth scroll to bottom + re-engage stickiness.
- **Smooth scroll respecting `prefers-reduced-motion`.** When reduced-motion is on, use `behavior: 'auto'` (instant) instead of `'smooth'`.
- **Anti-hardcode applies.** Threshold pixels, animation durations, scroll behavior → all live in `src/server/config/chatScrollBehavior.ts` (typed constants) or use the existing `motion.css` tokens.

---

## Implementation

In `src/components/app/emma-chat.tsx` (or the chat-message-list child component):

### 1. Track "user is at bottom" state

```ts
const STICK_THRESHOLD_PX = 80;  // from src/server/config/chatScrollBehavior.ts

const scrollRef = useRef<HTMLDivElement>(null);
const [isAtBottom, setIsAtBottom] = useState(true);

const handleScroll = useCallback(() => {
  const el = scrollRef.current;
  if (!el) return;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  setIsAtBottom(distanceFromBottom < STICK_THRESHOLD_PX);
}, []);
```

Attach `onScroll={handleScroll}` to the scroll container.

### 2. Stick-to-bottom on content changes

```ts
useEffect(() => {
  if (!isAtBottom) return;  // user scrolled away — leave them alone
  const el = scrollRef.current;
  if (!el) return;
  el.scrollTo({
    top: el.scrollHeight,
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });
}, [messages, isAtBottom, prefersReducedMotion]);
// ALSO trigger on streaming-content changes — listen to the last message's
// content length or the AI SDK's `isLoading`/streaming signal so we follow
// each new chunk, not just new message rows.
```

For streaming token-by-token: the above effect alone doesn't fire on partial updates inside the SAME assistant message. Two options:

- **Option A (preferred):** the `messages` array reference changes on each token (Vercel AI SDK behavior with `useChat`). Verify in practice — if so, the effect above is enough.
- **Option B (fallback):** use a `ResizeObserver` on the message list inner content. Whenever the content grows AND `isAtBottom === true`, scroll. Cleaner across providers.

```ts
useEffect(() => {
  const el = scrollRef.current;
  if (!el) return;
  const inner = el.querySelector('[data-messages-inner]');
  if (!inner) return;
  const observer = new ResizeObserver(() => {
    if (!isAtBottom) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  });
  observer.observe(inner);
  return () => observer.disconnect();
}, [isAtBottom, prefersReducedMotion]);
```

Pick A if it works, fall back to B if Vercel AI SDK doesn't trigger re-renders on every token.

### 3. "New messages" pill when user is scrolled up

When `!isAtBottom && (isStreaming || newMessageArrived)`, show a small pill at bottom-right of the chat region:

```
[ ↓ nuevos mensajes ]
```

Style: amber pill `var(--emma-amber)` background, paper text, mono small caps, 4px radius. Position: `bottom: 20px; right: 20px; position: absolute;`. Entrance: fade + slide-up 8px over 200ms (using `var(--motion-duration-base)`).

Click → `scrollTo({ top: scrollHeight, behavior: 'smooth' })` + sets `isAtBottom = true`. Pill disappears with fade.

### 4. `prefers-reduced-motion` detection

Use a `useReducedMotion` hook (Framer Motion exports one) OR a quick custom:

```ts
const prefersReducedMotion = useMemo(
  () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  [],
);
```

When true: scroll `behavior: 'auto'` (instant) AND no pill entrance animation.

---

## Config file

Create `src/server/config/chatScrollBehavior.ts`:

```ts
import 'server-only';

/**
 * Px distance from the scroll-bottom that still counts as "at bottom"
 * for the auto-follow behavior. 80px ≈ 4 lines of body text, generous
 * enough that minor user nudges don't break stickiness.
 */
export const STICK_TO_BOTTOM_THRESHOLD_PX = 80;

/**
 * Min ms between programmatic smooth-scrolls during streaming. Too low
 * and the browser queues scrolls faster than it can animate; too high
 * and the follow feels laggy on fast streams. 80ms = ~12fps cap.
 */
export const MIN_AUTO_SCROLL_INTERVAL_MS = 80;
```

Note: `'server-only'` here is fine for typed constants — they're inlined at build time and reachable from the client via the standard imports the rest of the codebase uses for similar config files. (If the linter complains about server-only inside a client component, drop the directive — it's a pure-data file.)

---

## Files

Edit:
- `src/components/app/emma-chat.tsx` (or `chat-message-list.tsx` if list extracted) — add scroll ref, scroll handler, stick-to-bottom effect, new-messages pill.

Create:
- `src/server/config/chatScrollBehavior.ts` — threshold + interval constants.

---

## Verify

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Then in `pnpm dev` at `/app/projects/reachy/chat`:

1. **Stick on stream**: send a message → Emma starts streaming → chat auto-scrolls smoothly to follow each token. Bottom always visible.
2. **Don't yank on scroll-up**: while Emma is mid-stream, scroll UP to re-read earlier conversation → page STAYS where you scrolled. The `↓ nuevos mensajes` amber pill appears bottom-right.
3. **Re-engage**: click the pill → smooth-scroll to bottom, pill fades out, auto-follow resumes.
4. **Send new message while scrolled up**: pill stays/refreshes. After Emma replies, your scroll position is preserved unless you click the pill.
5. **Reduced motion**: enable OS-level reduce-motion → scrolls become instant, pill entrance is instant. Nothing breaks.
6. **Long conversation**: 50+ messages in history → reload → scrolls to bottom on mount (instant on initial load is fine — `behavior: 'auto'`).
7. Anti-hardcode: `rg -n '80\|threshold\|smooth' src/components/app/emma-chat.tsx` → all numeric values reference the config import, not inline.

---

## Done

Reply with:
- 1 short clip / description: send → auto-follows → scroll-up → pill appears → click pill → resumes.
- Confirm reduced-motion path works (instant scroll, no entrance anim).
- Confirm the pill positioning is bottom-right, amber, mono, 200ms fade entrance.
- Anti-hardcode grep (0 inline scroll thresholds or behaviors outside the config file).
