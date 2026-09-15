# Spring physics

`spring(element, targetProperties, config?)` animates numeric style
properties toward a target using a hand-rolled damped-spring simulation,
rather than a fixed-duration timeline.

## Model

Each numeric property gets its own independent spring state
`{ pos, vel }`, initialized relative to the target:

```
pos = currentValue - target
vel = config.initialVelocity
```

Every step (fixed `dt = 1/60` seconds, i.e. a simulated 60fps):

```
force        = -stiffness * pos - damping * vel
acceleration = force / mass
vel         += acceleration * dt
pos         += vel * dt
current      = target + pos
```

`current` is written to `element.style` via `setProperty` on every step —
this is a direct-write simulation, not a CSS transition or WAAPI keyframe
track. Each property converges independently; there is no cross-property
coupling.

## Config and defaults

```ts
interface SpringConfig {
  stiffness?: number;       // default 170
  damping?: number;         // default 26
  mass?: number;            // default 1
  initialVelocity?: number; // default 0
}
```

Unset fields fall back to the defaults above via `Required<SpringConfig>`
resolution inside `spring()` — you can override any subset.

## Settling and the safety cap

A property is considered settled once `|pos| <= 0.01` **and**
`|vel| <= 0.01`. The whole simulation resolves once every property has
settled, or after `600` frames (10 simulated seconds) — whichever comes
first, as a safety cap against a config that never converges (e.g.
`damping: 0`).

On settling (by either path), every numeric target is **snapped** to its
exact target value (not left at the last simulated `pos`), so the promise
always resolves with the element's style exactly matching
`targetProperties` for numeric entries.

## String-valued targets

`targetProperties` accepts `string | number` values. Only entries that parse
as a finite number via `parseFloat` participate in the spring simulation.
Non-numeric entries (e.g. `{ display: "block" }`) are collected separately
and written to the element **once, at the end**, alongside the final
numeric snap — they are never animated, only set at settle time.

```ts
await motion.spring(el, { transform: "translateX(0)", opacity: 1, display: "block" });
// "transform": not numeric via parseFloat("translateX(0)") -> NaN -> written once at the end, unanimated
// "opacity": numeric -> springs from its current value to 1
// "display": non-numeric -> written once at the end, unanimated
```

Be aware that `parseFloat` on a string like `"translateX(0)"` returns `NaN`
(it does not extract the `0`), so most `transform` strings fall into the
"written once at the end" bucket rather than being interpolated — only bare
numeric strings or numbers (e.g. `"0.75"`, `12`) spring.

## Reduced motion

If reduced motion is active and `strategy.skipAnimations` is `true`, the
simulation loop never runs: `spring` sets
`element.style.transitionDuration = "${instantDuration}ms"` and writes every
`targetProperties` entry (numeric and string alike) directly, then resolves.
See [reduced-motion.md](reduced-motion.md).

## Timing mechanism

The tick loop is driven by `setTimeout(tick, dt * 1000)` (~16.67ms), not
`requestAnimationFrame`. This keeps the simulation deterministic in Node and
jsdom test environments (no need for a `requestAnimationFrame` polyfill),
but it is not frame-paced against the browser's actual compositor tick in a
real page.

## Example

```ts
const motion = createMotionEngine({ respectPrefersReducedMotion: false });

await motion.spring(
  cardEl,
  { opacity: 1 },
  { stiffness: 500, damping: 40 } // stiffer, more damped than the default — settles faster with less overshoot
);
```
