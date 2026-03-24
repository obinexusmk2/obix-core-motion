/**
 * OBIX Motion - Accessible animation engine with motion preference detection,
 * spring physics, variant presets, orchestration, and policy enforcement.
 */
// ---------------------------------------------------------------------------
// Motion variants
// ---------------------------------------------------------------------------
export var MotionVariant;
(function (MotionVariant) {
    MotionVariant["FadeIn"] = "FadeIn";
    MotionVariant["FadeOut"] = "FadeOut";
    MotionVariant["SlideUp"] = "SlideUp";
    MotionVariant["SlideDown"] = "SlideDown";
    MotionVariant["SlideLeft"] = "SlideLeft";
    MotionVariant["SlideRight"] = "SlideRight";
    MotionVariant["ScaleIn"] = "ScaleIn";
    MotionVariant["ScaleOut"] = "ScaleOut";
})(MotionVariant || (MotionVariant = {}));
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const applyProperties = (element, frame) => {
    if (!frame)
        return;
    Object.entries(frame.properties).forEach(([key, value]) => {
        element.style.setProperty(key, String(value));
    });
};
const VARIANT_TIMELINES = {
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
function simulateSpring(element, targetProperties, config, instant, instantDuration) {
    return new Promise((resolve) => {
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
        const numericTargets = {};
        const stringTargets = {};
        for (const [key, value] of Object.entries(targetProperties)) {
            const num = parseFloat(String(value));
            if (!isNaN(num)) {
                numericTargets[key] = num;
            }
            else {
                stringTargets[key] = String(value);
            }
        }
        // Per-property spring state
        const state = {};
        for (const [key, target] of Object.entries(numericTargets)) {
            const current = parseFloat(element.style.getPropertyValue(key) ?? "0") || 0;
            state[key] = { pos: current - target, vel: initialVelocity };
        }
        let frame = 0;
        let animFrameId;
        function tick() {
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
            }
            else {
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
export function createMotionEngine(config) {
    const timelines = new Map();
    const policies = [];
    const strategy = {
        skipAnimations: true,
        skipTransitions: true,
        instantDuration: 0,
        ...(config.reducedMotionStrategy ?? {}),
    };
    const shouldReduceMotion = () => {
        if (!config.respectPrefersReducedMotion ||
            typeof window === "undefined" ||
            typeof window.matchMedia !== "function") {
            return false;
        }
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    };
    const engine = {
        // -----------------------------------------------------------------------
        // animate
        // -----------------------------------------------------------------------
        async animate(element, timeline) {
            timelines.set(timeline.name, timeline);
            const first = timeline.keyframes[0];
            const last = timeline.keyframes[timeline.keyframes.length - 1];
            applyProperties(element, first);
            if (shouldReduceMotion() && strategy.skipAnimations) {
                element.style.transitionDuration = `${strategy.instantDuration ?? 0}ms`;
                applyProperties(element, last);
                return;
            }
            await new Promise((resolve) => {
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
        async sequence(animations) {
            for (const anim of animations) {
                await engine.animate(anim.element, anim.timeline);
            }
        },
        // -----------------------------------------------------------------------
        // parallel — run all animations concurrently
        // -----------------------------------------------------------------------
        async parallel(animations) {
            await Promise.all(animations.map((anim) => engine.animate(anim.element, anim.timeline)));
        },
        // -----------------------------------------------------------------------
        // stagger — run animations with incrementing delay offset
        // -----------------------------------------------------------------------
        async stagger(animations, delayMs = 50) {
            await Promise.all(animations.map((anim, index) => {
                const staggered = {
                    ...anim.timeline,
                    delay: (anim.timeline.delay ?? 0) + index * delayMs,
                };
                return engine.animate(anim.element, staggered);
            }));
        },
        // -----------------------------------------------------------------------
        // applyVariant — apply a predefined motion preset
        // -----------------------------------------------------------------------
        async applyVariant(element, variant, duration = 300) {
            const buildTimeline = VARIANT_TIMELINES[variant];
            const timeline = buildTimeline(duration);
            await engine.animate(element, timeline);
        },
        // -----------------------------------------------------------------------
        // spring — physics-based animation
        // -----------------------------------------------------------------------
        async spring(element, targetProperties, config = {}) {
            const resolved = {
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
        registerTimeline(timeline) {
            timelines.set(timeline.name, timeline);
        },
        getTimeline(name) {
            return timelines.get(name);
        },
        registerPolicy(policy) {
            policies.push(policy);
        },
        validatePolicies(timeline) {
            const violations = [];
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
        respectReducedMotion() {
            return shouldReduceMotion();
        },
    };
    return engine;
}
//# sourceMappingURL=index.js.map