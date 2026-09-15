# @obinexusltd/obix-sdk-motion

Accessible animation engine for the OBIX SDK — every entry point funnels
through a single `prefers-reduced-motion` gate, with spring physics, preset
variants, sequence/parallel/stagger orchestration, and pluggable validation
policies on top.

## The problem it owns

Reduced-motion support is usually bolted onto animation code per-component,
which means it is inconsistently applied and easy to regress. This package
centralizes the decision: `animate`, `spring`, `applyVariant`, `sequence`,
`parallel` and `stagger` all resolve through the same `shouldReduceMotion()`
check, so one `MotionConfig` decides whether an entire app's motion collapses
to instant end-states or plays in full. It also gives timelines a name-keyed
registry and a policy hook so animation authoring can be linted (e.g. "no
timeline under 150ms") before it ships.

## Install

```bash
npm install @obinexusltd/obix-sdk-motion
```

Requires `@obinexusltd/obix-sdk-core` as a peer dependency.

## API

```ts
import {
  createMotionEngine,
  MotionVariant,
  type MotionConfig,
  type MotionEngine,
  type Timeline,
  type Keyframe,
  type SpringConfig,
  type MotionPolicy,
  type ReducedMotionStrategy,
  type Easing,
} from "@obinexusltd/obix-sdk-motion";
```

| Export | Description |
|--------|-------------|
| `createMotionEngine(config: MotionConfig)` | Factory. Returns a `MotionEngine` bound to that config's reduced-motion strategy. |
| `animate(element, timeline)` | Applies the timeline's first keyframe immediately, then its last keyframe after `duration + delay` ms (or instantly, under reduced motion). Registers the timeline as a side effect. |
| `sequence(animations)` | Awaits each `animate` call one after another. |
| `parallel(animations)` | Runs all `animate` calls concurrently via `Promise.all`. |
| `stagger(animations, delayMs = 50)` | Runs concurrently, adding `index * delayMs` to each animation's own `delay`. |
| `applyVariant(element, variant, duration = 300)` | Builds and plays a built-in `MotionVariant` timeline. |
| `spring(element, targetProperties, config?)` | Physics-based animation — see [docs/spring-physics.md](docs/spring-physics.md). |
| `registerTimeline(timeline)` / `getTimeline(name)` | Name-keyed timeline registry. |
| `registerPolicy(policy)` / `validatePolicies(timeline)` | Register `MotionPolicy` validators; run them against a timeline and collect violation messages. |
| `respectReducedMotion()` | Returns whether the engine currently treats `prefers-reduced-motion: reduce` as active. |

See [docs/api-reference.md](docs/api-reference.md) for the full type reference.

## Example

```ts
import { createMotionEngine, MotionVariant } from "@obinexusltd/obix-sdk-motion";

const motion = createMotionEngine({
  respectPrefersReducedMotion: true,
  reducedMotionStrategy: { skipAnimations: true, skipTransitions: true, instantDuration: 0 },
});

const card = document.querySelector<HTMLElement>("#card")!;

// Preset variant — collapses to the end state instantly if the OS
// requests reduced motion.
await motion.applyVariant(card, MotionVariant.SlideUp, 240);

// Spring physics for a drag-release settle.
await motion.spring(card, { transform: "translateX(0)" }, { stiffness: 300, damping: 28 });

// Staggered list entrance.
const items = [...document.querySelectorAll<HTMLElement>(".list-item")];
await motion.stagger(
  items.map((el) => ({
    element: el,
    timeline: {
      name: "item-in",
      duration: 200,
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 1, properties: { opacity: 1 } },
      ],
    },
  })),
  40
);
```

## Docs

- [docs/api-reference.md](docs/api-reference.md) — full type and method reference
- [docs/reduced-motion.md](docs/reduced-motion.md) — the `prefers-reduced-motion` contract
- [docs/spring-physics.md](docs/spring-physics.md) — the spring simulation model
- [docs/variants-and-timelines.md](docs/variants-and-timelines.md) — `MotionVariant` presets and timeline shape
- [docs/orchestration-and-policies.md](docs/orchestration-and-policies.md) — `sequence`/`parallel`/`stagger`, the timeline registry, and `MotionPolicy`

## Boundary

- `animate` is not a keyframe interpolator. It writes the first keyframe's
  properties synchronously, waits `duration + delay` ms, then writes the last
  keyframe's properties. Keyframes between the first and last are stored on
  the `Timeline` (retrievable via `getTimeline`) but never applied to the
  element by this engine — smooth interpolation is expected to come from CSS
  `transition`/`animation` declared on the element itself, not from this
  library driving intermediate frames.
- `Easing` (`Keyframe.easing`, `MotionConfig.defaultEasing`) is typed but not
  currently read by `createMotionEngine` — no easing curve is applied to
  `animate` or `spring`.
- `spring` drives its simulation with `setTimeout` at a fixed 60fps step, not
  `requestAnimationFrame` — deterministic in Node/jsdom, but not frame-paced
  in a real browser tab.
- Not a full animation authoring tool: no native Web Animations API driver,
  no CSS-in-JS output, no timeline scrubbing/seeking.

MIT — OBINexus Computing
