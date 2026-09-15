# Orchestration, the timeline registry, and policies

## `sequence` vs `parallel` vs `stagger`

All three take `Array<{ element: HTMLElement; timeline: Timeline }>` and
build on `animate` — none of them have their own reduced-motion branching,
so all inherit the [reduced-motion contract](reduced-motion.md) per
individual `animate` call.

### `sequence(animations)`

```ts
async sequence(animations) {
  for (const anim of animations) {
    await engine.animate(anim.element, anim.timeline);
  }
}
```

Strictly one-at-a-time, in array order. Total wall time is the sum of every
animation's `duration + delay`. Use this when a later animation depends on
an earlier one having visibly finished (e.g. a modal fades out, then the
next one fades in).

### `parallel(animations)`

```ts
async parallel(animations) {
  await Promise.all(animations.map((anim) => engine.animate(anim.element, anim.timeline)));
}
```

All animations start on the same tick. Total wall time is the **longest**
individual `duration + delay`. Each `Timeline`'s own `delay` (if any) still
applies per-animation — `parallel` does not clear or offset it.

### `stagger(animations, delayMs = 50)`

```ts
async stagger(animations, delayMs = 50) {
  await Promise.all(
    animations.map((anim, index) => {
      const staggered = { ...anim.timeline, delay: (anim.timeline.delay ?? 0) + index * delayMs };
      return engine.animate(anim.element, staggered);
    })
  );
}
```

Like `parallel`, but each animation's `Timeline` is cloned with its `delay`
increased by `index * delayMs` before being played — index `0` is
unaffected (beyond its own existing `delay`), index `1` is pushed back by
`delayMs`, index `2` by `2 * delayMs`, and so on. Because the clone spreads
the original timeline, `name` is preserved, so `getTimeline` after a
`stagger` call returns whichever staggered clone was registered last (later
`animate` calls in the `Promise.all` overwrite earlier registry entries
under the same `name` — give staggered items distinct `timeline.name`s if
you need to look each one up individually afterward).

```ts
await motion.stagger(
  listItems.map((el, i) => ({
    element: el,
    timeline: { name: `item-${i}`, duration: 200, keyframes: fadeInKeyframes },
  })),
  40 // item i starts 40ms * i after the batch begins
);
```

## Timeline registry

```ts
registerTimeline(timeline: Timeline): void;
getTimeline(name: string): Timeline | undefined;
```

Backed by a single `Map<string, Timeline>` per engine instance, keyed by
`timeline.name`. Two things write to it:

1. An explicit `registerTimeline(timeline)` call.
2. Any `animate(element, timeline)` call, as a side effect — the timeline it
   was given is registered under its `name` before anything else happens.

There is no `unregisterTimeline` or `listTimelines` — the registry is a
simple lookup table, not a lifecycle-managed store. Re-registering (or
re-playing) a timeline with the same `name` overwrites the previous entry.

## `MotionPolicy`

```ts
interface MotionPolicy {
  name: string;
  validate(timeline: Timeline): string | null; // null = no violation
}

registerPolicy(policy: MotionPolicy): void;
validatePolicies(timeline: Timeline): string[];
```

`policies` is a plain append-only array — `registerPolicy` pushes, there is
no dedup by `name` and no removal API. `validatePolicies(timeline)` runs
every registered policy's `validate(timeline)` against the given timeline
(not against timelines already in the registry) and collects every non-null
result as `` `[${policy.name}] ${result}` ``.

Policies are pure validation: nothing in `MotionEngine` calls
`validatePolicies` automatically before `animate` plays a timeline. Wire it
in at the call site yourself if you want enforcement rather than just
reporting:

```ts
motion.registerPolicy({
  name: "min-duration",
  validate: (tl) => (tl.duration <= 0 ? "Timeline duration must be greater than 0ms" : null),
});

motion.registerPolicy({
  name: "max-duration",
  validate: (tl) => (tl.duration > 1000 ? "Timeline duration must not exceed 1000ms" : null),
});

function playChecked(engine: MotionEngine, element: HTMLElement, timeline: Timeline) {
  const violations = engine.validatePolicies(timeline);
  if (violations.length > 0) {
    throw new Error(`Motion policy violation:\n${violations.join("\n")}`);
  }
  return engine.animate(element, timeline);
}
```

This is useful as a lint-style guard in design-system code — e.g. rejecting
timelines that are too fast to be perceivable, too slow to feel responsive,
or that animate a disallowed CSS property — without hardcoding those rules
into the engine itself.
