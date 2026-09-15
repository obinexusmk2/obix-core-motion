# The `prefers-reduced-motion` contract

Every animating method on `MotionEngine` — `animate`, `spring`,
`applyVariant`, and by extension `sequence`/`parallel`/`stagger` — resolves
through the same internal `shouldReduceMotion()` check before it decides
whether to play in full or jump to the end state. This document is the
contract for exactly when that happens.

## `shouldReduceMotion()`

```ts
const shouldReduceMotion = (): boolean => {
  if (
    !config.respectPrefersReducedMotion ||
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};
```

Reduced motion is treated as **inactive** (animations play normally) in three
cases, checked in order:

1. `config.respectPrefersReducedMotion` is `false` — the engine opts out of
   the check entirely, regardless of the OS setting.
2. `window` is `undefined` — SSR or a non-DOM environment.
3. `window.matchMedia` is not a function — a DOM-like environment (e.g. a
   test mock) that hasn't stubbed `matchMedia`.

Otherwise, the result is exactly
`window.matchMedia("(prefers-reduced-motion: reduce)").matches`. There is no
caching — every call re-queries `matchMedia`, so a user who toggles the OS
setting mid-session is picked up on the next animation call, not just at
`createMotionEngine` time.

## `ReducedMotionStrategy`

```ts
interface ReducedMotionStrategy {
  skipAnimations: boolean;
  skipTransitions: boolean;
  instantDuration?: number;
}
```

Defaults (applied via a shallow merge over whatever you pass in
`MotionConfig.reducedMotionStrategy`):

```ts
{ skipAnimations: true, skipTransitions: true, instantDuration: 0 }
```

- **`skipAnimations`** is the only field the engine currently branches on. If
  `true` and reduced motion is active, `animate` and `spring` skip straight
  to their end state. If you set it to `false`, reduced motion is detected
  (`respectReducedMotion()` still returns `true`) but `animate`/`spring` play
  through their normal, full-duration path anyway.
- **`skipTransitions`** is accepted on the type and merged into `strategy`,
  but nothing in `createMotionEngine` currently reads it.
- **`instantDuration`** is the number of milliseconds written to
  `element.style.transitionDuration` when an animation is short-circuited —
  not how long the engine waits before applying the end state (that happens
  on the same tick).

## What "instant" means per method

| Method | Under reduced motion + `skipAnimations: true` |
|--------|-------------------------------------------------|
| `animate` | Sets `element.style.transitionDuration = "${instantDuration}ms"`, writes the **last** keyframe's properties, resolves immediately. The **first** keyframe was already written before the check ran. |
| `spring` | Sets `element.style.transitionDuration`, writes every `targetProperties` entry directly (numeric and string values alike — the Euler simulation loop never runs), resolves immediately. |
| `applyVariant` | Delegates to `animate` with the preset's two-keyframe timeline, so it inherits `animate`'s behavior above. |
| `sequence` / `parallel` / `stagger` | No special-case logic of their own — they inherit whatever `animate` does per animation, so a staggered list still resolves to its end states with no visible stagger when reduced motion is active. |

## Testing it

`window.matchMedia` is read fresh on every call, so tests stub it directly
rather than mocking a media-query listener:

```ts
vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });

const motion = createMotionEngine({
  respectPrefersReducedMotion: true,
  reducedMotionStrategy: { skipAnimations: true, skipTransitions: true, instantDuration: 1 },
});

await motion.animate(el, timeline);
// el.style.transitionDuration === "1ms"
// el's last-keyframe properties are applied with no setTimeout delay
```

See [`__tests__/integration.test.ts`](../__tests__/integration.test.ts) for
the full reduced-motion and spring-under-reduced-motion cases.
