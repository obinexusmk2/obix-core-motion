# API reference

Full type and method surface of `@obinexusltd/obix-sdk-motion`. All of it is
exported from the package root (`src/index.ts`); there is no subpath export.

## `createMotionEngine(config: MotionConfig): MotionEngine`

The only factory. Each call returns an independent engine with its own
timeline registry, policy list, and reduced-motion strategy.

```ts
interface MotionConfig {
  respectPrefersReducedMotion: boolean;
  reducedMotionStrategy?: ReducedMotionStrategy;
  defaultEasing?: Easing;
}
```

- `respectPrefersReducedMotion` — when `false`, the engine never checks
  `window.matchMedia` and always plays animations in full, regardless of the
  OS setting.
- `reducedMotionStrategy` — merged over the default
  `{ skipAnimations: true, skipTransitions: true, instantDuration: 0 }`. See
  [reduced-motion.md](reduced-motion.md).
- `defaultEasing` — typed but currently unread by the engine (see the
  Boundary section in the [README](../README.md)).

## `MotionEngine`

```ts
interface MotionEngine {
  animate(element: HTMLElement, timeline: Timeline): Promise<void>;
  sequence(animations: Array<{ element: HTMLElement; timeline: Timeline }>): Promise<void>;
  parallel(animations: Array<{ element: HTMLElement; timeline: Timeline }>): Promise<void>;
  stagger(animations: Array<{ element: HTMLElement; timeline: Timeline }>, delayMs?: number): Promise<void>;

  applyVariant(element: HTMLElement, variant: MotionVariant, duration?: number): Promise<void>;
  spring(element: HTMLElement, targetProperties: Record<string, string | number>, config?: SpringConfig): Promise<void>;

  registerTimeline(timeline: Timeline): void;
  getTimeline(name: string): Timeline | undefined;
  registerPolicy(policy: MotionPolicy): void;
  validatePolicies(timeline: Timeline): string[];

  respectReducedMotion(): boolean;
}
```

### `animate(element, timeline)`

1. Registers `timeline` in the internal registry under `timeline.name`
   (same effect as calling `registerTimeline` first).
2. Writes `timeline.keyframes[0]`'s properties to `element.style` immediately.
3. If reduced motion is active and `strategy.skipAnimations` is `true`: sets
   `element.style.transitionDuration` to `strategy.instantDuration ?? 0` and
   writes the last keyframe's properties, then resolves.
4. Otherwise: waits `Math.max(0, timeline.duration + (timeline.delay ?? 0))`
   milliseconds via `setTimeout`, then writes the last keyframe's properties
   and resolves.

Only the first and last entries of `timeline.keyframes` are ever written to
the element — see the Boundary section of the [README](../README.md).

### `sequence(animations)` / `parallel(animations)` / `stagger(animations, delayMs?)`

All three take the same shape, `Array<{ element: HTMLElement; timeline: Timeline }>`:

- `sequence` awaits each `animate` call in array order.
- `parallel` calls `Promise.all` over `animate` for every entry.
- `stagger` (default `delayMs = 50`) also runs concurrently, but each
  animation's timeline is cloned with
  `delay: (timeline.delay ?? 0) + index * delayMs` before being played — so
  entry `0` uses its own delay unmodified and entry `n` is pushed back by
  `n * delayMs`.

See [orchestration-and-policies.md](orchestration-and-policies.md) for
composition patterns.

### `applyVariant(element, variant, duration = 300)`

Looks up `variant` in the built-in preset table, builds a two-keyframe
`Timeline` at the given `duration`, and plays it via `animate`. See
[variants-and-timelines.md](variants-and-timelines.md) for the full preset
list.

### `spring(element, targetProperties, config?)`

Runs a critically-damped-style spring simulation toward `targetProperties`.
See [spring-physics.md](spring-physics.md) for the model and defaults.

### `registerTimeline(timeline)` / `getTimeline(name)`

A plain `Map<string, Timeline>` keyed by `timeline.name`. `animate` also
writes to this map as a side effect, so a timeline becomes retrievable the
first time it is played even without an explicit `registerTimeline` call.

### `registerPolicy(policy)` / `validatePolicies(timeline)`

`policies` is an append-only array; `validatePolicies` runs every registered
`MotionPolicy.validate(timeline)` and collects non-`null` results as
`` `[${policy.name}] ${result}` `` strings. See
[orchestration-and-policies.md](orchestration-and-policies.md#motionpolicy).

### `respectReducedMotion()`

Returns the live result of the engine's internal `shouldReduceMotion()`
check — `false` whenever `respectPrefersReducedMotion` is `false`, or when
`window`/`window.matchMedia` is unavailable (SSR, non-DOM test
environments), or when the media query does not match; otherwise mirrors
`window.matchMedia("(prefers-reduced-motion: reduce)").matches`.

## Supporting types

```ts
type Easing =
  | "linear" | "easeIn" | "easeOut" | "easeInOut" | "cubic"
  | ((progress: number) => number);

interface Keyframe {
  offset: number;                              // 0..1, informational — only offset 0 and 1 are read
  properties: Record<string, string | number>;
  easing?: Easing;                              // typed, not currently consumed
}

interface Timeline {
  name: string;
  duration: number;                             // ms
  delay?: number;                               // ms, default 0
  iterations?: number;                          // typed, not currently consumed
  direction?: "normal" | "reverse" | "alternate"; // typed, not currently consumed
  keyframes: Keyframe[];
}

interface ReducedMotionStrategy {
  skipAnimations: boolean;
  skipTransitions: boolean;
  instantDuration?: number;                     // ms, default 0
}

interface SpringConfig {
  stiffness?: number;   // default 170
  damping?: number;     // default 26
  mass?: number;        // default 1
  initialVelocity?: number; // default 0
}

interface MotionPolicy {
  name: string;
  validate(timeline: Timeline): string | null;  // null = passes
}

enum MotionVariant {
  FadeIn, FadeOut, SlideUp, SlideDown, SlideLeft, SlideRight, ScaleIn, ScaleOut,
}
```

`Timeline.iterations` and `Timeline.direction` are accepted on the type for
forward compatibility with a future WAAPI-backed driver but are not read by
the current `animate` implementation.
