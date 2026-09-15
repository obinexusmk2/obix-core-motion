# Variants and timelines

## `Timeline` shape

```ts
interface Timeline {
  name: string;
  duration: number;                              // ms
  delay?: number;                                 // ms, default 0
  iterations?: number;                            // typed, not read by animate
  direction?: "normal" | "reverse" | "alternate"; // typed, not read by animate
  keyframes: Keyframe[];
}

interface Keyframe {
  offset: number;                                 // 0..1
  properties: Record<string, string | number>;
  easing?: Easing;                                // typed, not read by animate
}
```

`animate` (and therefore everything built on it — `sequence`, `parallel`,
`stagger`, `applyVariant`) only ever reads `keyframes[0]` and
`keyframes[keyframes.length - 1]`. A `Timeline` with three or more keyframes
is valid and fully retrievable via `getTimeline`, but the middle entries are
inert data as far as this engine's DOM writes are concerned — see the
Boundary section in the [README](../README.md) for why, and pair such
timelines with a CSS `transition`/`animation` on the element if you need the
browser to interpolate between them.

`offset` is present for authoring clarity and for a future interpolating
driver; the current engine does not branch on it (it always treats index 0
as "first" and the last index as "last", not the entries whose `offset` is
literally `0` or `1`).

## `MotionVariant` presets

`applyVariant(element, variant, duration = 300)` looks up a built-in
timeline builder keyed by `MotionVariant` and plays it via `animate`. Every
preset is a plain two-keyframe fade or transform:

| `MotionVariant` | Timeline name | `offset: 0` | `offset: 1` |
|---|---|---|---|
| `FadeIn` | `fade-in` | `opacity: 0` | `opacity: 1` |
| `FadeOut` | `fade-out` | `opacity: 1` | `opacity: 0` |
| `SlideUp` | `slide-up` | `transform: translateY(24px)` | `transform: translateY(0px)` |
| `SlideDown` | `slide-down` | `transform: translateY(-24px)` | `transform: translateY(0px)` |
| `SlideLeft` | `slide-left` | `transform: translateX(24px)` | `transform: translateX(0px)` |
| `SlideRight` | `slide-right` | `transform: translateX(-24px)` | `transform: translateX(0px)` |
| `ScaleIn` | `scale-in` | `transform: scale(0.85)` | `transform: scale(1)` |
| `ScaleOut` | `scale-out` | `transform: scale(1)` | `transform: scale(0.85)` |

Every preset's `duration` is whatever you pass to `applyVariant` (default
`300`ms) — the table above only fixes the property values, not the timing.
There is no `delay` on preset timelines.

```ts
await motion.applyVariant(el, MotionVariant.SlideUp);       // 300ms
await motion.applyVariant(el, MotionVariant.ScaleIn, 150);  // 150ms
```

Because `applyVariant` calls `animate` under the hood, it fully inherits the
[reduced-motion contract](reduced-motion.md): under
`respectPrefersReducedMotion: true` with `skipAnimations: true`, the element
jumps straight to the `offset: 1` values.

## Authoring your own timelines

For anything beyond the eight presets, build a `Timeline` directly and pass
it to `animate` (or register it first for later reuse):

```ts
const heroEnter: Timeline = {
  name: "hero-enter",
  duration: 400,
  delay: 100,
  keyframes: [
    { offset: 0, properties: { opacity: 0, transform: "translateY(12px)" } },
    { offset: 1, properties: { opacity: 1, transform: "translateY(0px)" } },
  ],
};

motion.registerTimeline(heroEnter);
await motion.animate(heroEl, motion.getTimeline("hero-enter")!);
```

Registering ahead of time is optional — `animate` registers whatever
`Timeline` it's given as a side effect, so the line above works the same if
you just call `motion.animate(heroEl, heroEnter)` directly. Pre-registering
is useful when a timeline is authored in one module and played by name from
another; see
[orchestration-and-policies.md](orchestration-and-policies.md) for the
registry API.
