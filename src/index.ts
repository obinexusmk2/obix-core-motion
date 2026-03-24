/**
 * OBIX Motion - Accessible animation engine with motion preference detection,
 * spring physics, variant presets, orchestration, and policy enforcement.
 */

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

export type Easing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "cubic"
  | ((progress: number) => number);

// ---------------------------------------------------------------------------
// Core animation types
// ---------------------------------------------------------------------------

export interface Keyframe {
  offset: number;
  properties: Record<string, string | number>;
  easing?: Easing;
}

export interface Timeline {
  name: string;
  duration: number;
  delay?: number;
  iterations?: number;
  direction?: "normal" | "reverse" | "alternate";
  keyframes: Keyframe[];
}

// ---------------------------------------------------------------------------
// Reduced-motion strategy
// ---------------------------------------------------------------------------

export interface ReducedMotionStrategy {
  skipAnimations: boolean;
  skipTransitions: boolean;
  instantDuration?: number;
}

export interface MotionConfig {
  respectPrefersReducedMotion: boolean;
  reducedMotionStrategy?: ReducedMotionStrategy;
  defaultEasing?: Easing;
}

// ---------------------------------------------------------------------------
// Motion variants
// ---------------------------------------------------------------------------

export enum MotionVariant {
  FadeIn = "FadeIn",
  FadeOut = "FadeOut",
  SlideUp = "SlideUp",
  SlideDown = "SlideDown",
  SlideLeft = "SlideLeft",
  SlideRight = "SlideRight",
  ScaleIn = "ScaleIn",
  ScaleOut = "ScaleOut",
}

// ---------------------------------------------------------------------------
// Spring physics
// ---------------------------------------------------------------------------

export interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
  initialVelocity?: number;
}

// ---------------------------------------------------------------------------
// Motion policies
// ---------------------------------------------------------------------------

export interface MotionPolicy {
  name: string;
  validate(timeline: Timeline): string | null;
}

// ---------------------------------------------------------------------------
// Engine interface
// ---------------------------------------------------------------------------

export interface MotionEngine {
  // Core
  animate(element: HTMLElement, timeline: Timeline): Promise<void>;
  sequence(animations: Array<{ element: HTMLElement; timeline: Timeline }>): Promise<void>;
  parallel(animations: Array<{ element: HTMLElement; timeline: Timeline }>): Promise<void>;
  stagger(animations: Array<{ element: HTMLElement; timeline: Timeline }>, delayMs?: number): Promise<void>;

  // Variants & spring
  applyVariant(element: HTMLElement, variant: MotionVariant, duration?: number): Promise<void>;
  spring(element: HTMLElement, targetProperties: Record<string, string | number>, config?: SpringConfig): Promise<void>;

  // Registry
  registerTimeline(timeline: Timeline): void;
  getTimeline(name: string): Timeline | undefined;
  registerPolicy(policy: MotionPolicy): void;
  validatePolicies(timeline: Timeline): string[];

  // Introspection
  respectReducedMotion(): boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const applyProperties = (element: HTMLElement, frame?: Keyframe): void => {
  if (!frame) return;
  Object.entries(frame.properties).forEach(([key, value]) => {
    element.style.setProperty(key, String(value));
  });
};

const VARIANT_TIMELINES: Record<MotionVariant, (duration: number) => Timeline> = {
  [MotionVariant.FadeIn]: (d) => ({
    name: "fade-in",
    duration: d,
    keyframes: [
      { offset: 0, properties: { opacity: 0 } },
      { offset: 1, properties: { opacity: 1 } },
    ],
  }),
  [MotionVariant.FadeOut]: (d) => ({
    name: "fade-out",
    duration: d,
    keyframes: [
      { offset: 0, properties: { opacity: 1 } },
      { offset: 1, properties: { opacity: 0 } },
    ],
  }),
  [MotionVariant.SlideUp]: (d) => ({
    name: "slide-up",
    duration: d,
    keyframes: [
      { offset: 0, properties: { transform: "translateY(24px)" } },
      { offset: 1, properties: { transform: "translateY(0px)" } },
    ],
  }),
  [MotionVariant.SlideDown]: (d) => ({
    name: "slide-down",
    duration: d,
    keyframes: [
      { offset: 0, properties: { transform: "translateY(-24px)" } },
      { offset: 1, properties: { transform: "translateY(0px)" } },
    ],
  }),
  [MotionVariant.SlideLeft]: (d) => ({
    name: "slide-left",
    duration: d,
    keyframes: [
      { offset: 0, properties: { transform: "translateX(24px)" } },
      { offset: 1, properties: { transform: "translateX(0px)" } },
    ],
  }),
  [MotionVariant.SlideRight]: (d) => ({
    name: "slide-right",
    duration: d,
    keyframes: [
      { offset: 0, properties: { transform: "translateX(-24px)" } },
      { offset: 1, properties: { transform: "translateX(0px)" } },
    ],
  }),
  [MotionVariant.ScaleIn]: (d) => ({
    name: "scale-in",
    duration: d,
    keyframes: [
      { offset: 0, properties: { transform: "scale(0.85)" } },
      { offset: 1, properties: { transform: "scale(1)" } },
    ],
  }),
  [MotionVariant.ScaleOut]: (d) => ({
    name: "scale-out",
    duration: d,
    keyframes: [
      { offset: 0, properties: { transform: "scale(1)" } },
      { offset: 1, properties: { transform: "scale(0.85)" } },
    ],
  }),
};

// Critically-damped spring simulation using simple Euler integration.
// Returns a promise that resolves once the spring has settled.
function simulateSpring(
  element: HTMLElement,
  targetProperties: Record<string, string | number>,
  config: Required<SpringConfig>,
  instant: boolean,
  instantDuration: number
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (instant) {
      element.style.transitionDuration = `${instantDuration}ms`;
      Object.entries(targetProperties).forEach(([key, value]) => {
        element.style.setProperty(key, String(value));
      });
      resolve();
      return;
    }

    const { stiffness, damping, mass, initialVelocity } = config;
    const dt = 1 / 60; // 60fps step in seconds
    const maxFrames = 600; // safety cap: ~10s
    const threshold = 0.01;

    // We only animate numeric values; string values are applied at the end.
    const numericTargets: Record<string, number> = {};
    const stringTargets: Record<string, string> = {};

    for (const [key, value] of Object.entries(targetProperties)) {
      const num = parseFloat(String(value));
      if (!isNaN(num)) {
        numericTargets[key] = num;
      } else {
        stringTargets[key] = String(value);
      }
    }

    // Per-property spring state
    const state: Record<string, { pos: number; vel: number }> = {};
    for (const [key, target] of Object.entries(numericTargets)) {
      const current = parseFloat(element.style.getPropertyValue(key) ?? "0") || 0;
      state[key] = { pos: current - target, vel: initialVelocity };
    }

    let frame = 0;
    let animFrameId: ReturnType<typeof setTimeout>;

    function tick(): void {
      let allSettled = true;
      frame++;

      for (const [key, s] of Object.entries(state)) {
        const target = numericTargets[key];
        const force = -stiffness * s.pos - damping * s.vel;
        const acceleration = force / mass;
        s.vel += acceleration * dt;
        s.pos += s.vel * dt;

        const current = target + s.pos;
        element.style.setProperty(key, String(current));

        if (Math.abs(s.pos) > threshold || Math.abs(s.vel) > threshold) {
          allSettled = false;
        }
      }

      if (allSettled || frame >= maxFrames) {
        // Snap to final values
        for (const [key, target] of Object.entries(numericTargets)) {
          element.style.setProperty(key, String(target));
        }
        for (const [key, value] of Object.entries(stringTargets)) {
          element.style.setProperty(key, value);
        }
        resolve();
      } else {
        animFrameId = setTimeout(tick, dt * 1000);
      }
    }

    animFrameId = setTimeout(tick, 0);
    void animFrameId; // suppress unused warning
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMotionEngine(config: MotionConfig): MotionEngine {
  const timelines = new Map<string, Timeline>();
  const policies: MotionPolicy[] = [];

  const strategy: ReducedMotionStrategy = {
    skipAnimations: true,
    skipTransitions: true,
    instantDuration: 0,
    ...(config.reducedMotionStrategy ?? {}),
  };

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

  const engine: MotionEngine = {
    // -----------------------------------------------------------------------
    // animate
    // -----------------------------------------------------------------------
    async animate(element: HTMLElement, timeline: Timeline): Promise<void> {
      timelines.set(timeline.name, timeline);
      const first = timeline.keyframes[0];
      const last = timeline.keyframes[timeline.keyframes.length - 1];

      applyProperties(element, first);

      if (shouldReduceMotion() && strategy.skipAnimations) {
        element.style.transitionDuration = `${strategy.instantDuration ?? 0}ms`;
        applyProperties(element, last);
        return;
      }

      await new Promise<void>((resolve) => {
        const totalDuration = Math.max(0, timeline.duration + (timeline.delay ?? 0));
        setTimeout(() => {
          applyProperties(element, last);
          resolve();
        }, totalDuration);
      });
    },

    // -----------------------------------------------------------------------
    // sequence — run animations one after another
    // -----------------------------------------------------------------------
    async sequence(animations: Array<{ element: HTMLElement; timeline: Timeline }>): Promise<void> {
      for (const anim of animations) {
        await engine.animate(anim.element, anim.timeline);
      }
    },

    // -----------------------------------------------------------------------
    // parallel — run all animations concurrently
    // -----------------------------------------------------------------------
    async parallel(animations: Array<{ element: HTMLElement; timeline: Timeline }>): Promise<void> {
      await Promise.all(animations.map((anim) => engine.animate(anim.element, anim.timeline)));
    },

    // -----------------------------------------------------------------------
    // stagger — run animations with incrementing delay offset
    // -----------------------------------------------------------------------
    async stagger(
      animations: Array<{ element: HTMLElement; timeline: Timeline }>,
      delayMs = 50
    ): Promise<void> {
      await Promise.all(
        animations.map((anim, index) => {
          const staggered: Timeline = {
            ...anim.timeline,
            delay: (anim.timeline.delay ?? 0) + index * delayMs,
          };
          return engine.animate(anim.element, staggered);
        })
      );
    },

    // -----------------------------------------------------------------------
    // applyVariant — apply a predefined motion preset
    // -----------------------------------------------------------------------
    async applyVariant(
      element: HTMLElement,
      variant: MotionVariant,
      duration = 300
    ): Promise<void> {
      const buildTimeline = VARIANT_TIMELINES[variant];
      const timeline = buildTimeline(duration);
      await engine.animate(element, timeline);
    },

    // -----------------------------------------------------------------------
    // spring — physics-based animation
    // -----------------------------------------------------------------------
    async spring(
      element: HTMLElement,
      targetProperties: Record<string, string | number>,
      config: SpringConfig = {}
    ): Promise<void> {
      const resolved: Required<SpringConfig> = {
        stiffness: config.stiffness ?? 170,
        damping: config.damping ?? 26,
        mass: config.mass ?? 1,
        initialVelocity: config.initialVelocity ?? 0,
      };

      const instant = shouldReduceMotion() && strategy.skipAnimations;
      await simulateSpring(element, targetProperties, resolved, instant, strategy.instantDuration ?? 0);
    },

    // -----------------------------------------------------------------------
    // Registry
    // -----------------------------------------------------------------------
    registerTimeline(timeline: Timeline): void {
      timelines.set(timeline.name, timeline);
    },

    getTimeline(name: string): Timeline | undefined {
      return timelines.get(name);
    },

    registerPolicy(policy: MotionPolicy): void {
      policies.push(policy);
    },

    validatePolicies(timeline: Timeline): string[] {
      const violations: string[] = [];
      for (const policy of policies) {
        const result = policy.validate(timeline);
        if (result !== null) {
          violations.push(`[${policy.name}] ${result}`);
        }
      }
      return violations;
    },

    // -----------------------------------------------------------------------
    // Introspection
    // -----------------------------------------------------------------------
    respectReducedMotion(): boolean {
      return shouldReduceMotion();
    },
  };

  return engine;
}
