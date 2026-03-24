/**
 * OBIX Motion - Accessible animation engine with motion preference detection,
 * spring physics, variant presets, orchestration, and policy enforcement.
 */
export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "cubic" | ((progress: number) => number);
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
export declare enum MotionVariant {
    FadeIn = "FadeIn",
    FadeOut = "FadeOut",
    SlideUp = "SlideUp",
    SlideDown = "SlideDown",
    SlideLeft = "SlideLeft",
    SlideRight = "SlideRight",
    ScaleIn = "ScaleIn",
    ScaleOut = "ScaleOut"
}
export interface SpringConfig {
    stiffness?: number;
    damping?: number;
    mass?: number;
    initialVelocity?: number;
}
export interface MotionPolicy {
    name: string;
    validate(timeline: Timeline): string | null;
}
export interface MotionEngine {
    animate(element: HTMLElement, timeline: Timeline): Promise<void>;
    sequence(animations: Array<{
        element: HTMLElement;
        timeline: Timeline;
    }>): Promise<void>;
    parallel(animations: Array<{
        element: HTMLElement;
        timeline: Timeline;
    }>): Promise<void>;
    stagger(animations: Array<{
        element: HTMLElement;
        timeline: Timeline;
    }>, delayMs?: number): Promise<void>;
    applyVariant(element: HTMLElement, variant: MotionVariant, duration?: number): Promise<void>;
    spring(element: HTMLElement, targetProperties: Record<string, string | number>, config?: SpringConfig): Promise<void>;
    registerTimeline(timeline: Timeline): void;
    getTimeline(name: string): Timeline | undefined;
    registerPolicy(policy: MotionPolicy): void;
    validatePolicies(timeline: Timeline): string[];
    respectReducedMotion(): boolean;
}
export declare function createMotionEngine(config: MotionConfig): MotionEngine;
//# sourceMappingURL=index.d.ts.map