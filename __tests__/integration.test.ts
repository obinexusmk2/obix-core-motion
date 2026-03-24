import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMotionEngine, MotionVariant } from '../src/index.js';

// Helper: create a mock HTMLElement with a style Map
function mockElement() {
  const styleMap = new Map<string, string>();
  const element = {
    style: {
      setProperty: (key: string, value: string) => styleMap.set(key, value),
      getPropertyValue: (key: string) => styleMap.get(key) ?? '',
      transitionDuration: '',
    },
    _styleMap: styleMap,
  } as unknown as HTMLElement & { _styleMap: Map<string, string> };
  return element;
}

describe('obix-motion integration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Existing: reduced-motion
  // -------------------------------------------------------------------------
  it('enforces prefers-reduced-motion strategy with instant fallback styles', async () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true })
    });

    const el = mockElement();

    const motion = createMotionEngine({
      respectPrefersReducedMotion: true,
      reducedMotionStrategy: { skipAnimations: true, skipTransitions: true, instantDuration: 1 }
    });

    await motion.animate(el, {
      name: 'fade-in',
      duration: 600,
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 1, properties: { opacity: 1 } }
      ]
    });

    expect(motion.respectReducedMotion()).toBe(true);
    expect(el.style.transitionDuration).toBe('1ms');
    expect(el._styleMap.get('opacity')).toBe('1');
  });

  // -------------------------------------------------------------------------
  // parallel
  // -------------------------------------------------------------------------
  it('parallel: applies final frame to all elements concurrently', async () => {
    const el1 = mockElement();
    const el2 = mockElement();

    const motion = createMotionEngine({ respectPrefersReducedMotion: false });

    await motion.parallel([
      { element: el1, timeline: { name: 'a', duration: 0, keyframes: [{ offset: 0, properties: { opacity: 0 } }, { offset: 1, properties: { opacity: 1 } }] } },
      { element: el2, timeline: { name: 'b', duration: 0, keyframes: [{ offset: 0, properties: { opacity: 0 } }, { offset: 1, properties: { opacity: 0.5 } }] } },
    ]);

    expect(el1._styleMap.get('opacity')).toBe('1');
    expect(el2._styleMap.get('opacity')).toBe('0.5');
  });

  // -------------------------------------------------------------------------
  // stagger
  // -------------------------------------------------------------------------
  it('stagger: all elements receive final frame after staggered delays', async () => {
    const el1 = mockElement();
    const el2 = mockElement();

    const motion = createMotionEngine({ respectPrefersReducedMotion: false });

    await motion.stagger([
      { element: el1, timeline: { name: 'c', duration: 0, keyframes: [{ offset: 0, properties: { opacity: 0 } }, { offset: 1, properties: { opacity: 1 } }] } },
      { element: el2, timeline: { name: 'd', duration: 0, keyframes: [{ offset: 0, properties: { opacity: 0 } }, { offset: 1, properties: { opacity: 1 } }] } },
    ], 10);

    expect(el1._styleMap.get('opacity')).toBe('1');
    expect(el2._styleMap.get('opacity')).toBe('1');
  });

  // -------------------------------------------------------------------------
  // applyVariant — FadeIn
  // -------------------------------------------------------------------------
  it('applyVariant FadeIn: applies opacity:1 to element', async () => {
    const el = mockElement();
    const motion = createMotionEngine({ respectPrefersReducedMotion: false });

    await motion.applyVariant(el, MotionVariant.FadeIn, 0);

    expect(el._styleMap.get('opacity')).toBe('1');
  });

  // -------------------------------------------------------------------------
  // applyVariant — SlideUp
  // -------------------------------------------------------------------------
  it('applyVariant SlideUp: applies translateY(0px) to element', async () => {
    const el = mockElement();
    const motion = createMotionEngine({ respectPrefersReducedMotion: false });

    await motion.applyVariant(el, MotionVariant.SlideUp, 0);

    expect(el._styleMap.get('transform')).toBe('translateY(0px)');
  });

  // -------------------------------------------------------------------------
  // spring — jumps to target under reduced motion
  // -------------------------------------------------------------------------
  it('spring: jumps to target properties instantly when reduced motion is active', async () => {
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: true })
    });

    const el = mockElement();
    const motion = createMotionEngine({
      respectPrefersReducedMotion: true,
      reducedMotionStrategy: { skipAnimations: true, skipTransitions: true, instantDuration: 0 }
    });

    await motion.spring(el, { opacity: 1 });

    expect(el._styleMap.get('opacity')).toBe('1');
  });

  // -------------------------------------------------------------------------
  // spring — applies target properties normally
  // -------------------------------------------------------------------------
  it('spring: applies target properties after simulation completes', async () => {
    const el = mockElement();
    const motion = createMotionEngine({ respectPrefersReducedMotion: false });

    await motion.spring(el, { opacity: 0.75 }, { stiffness: 500, damping: 40 });

    expect(el._styleMap.get('opacity')).toBe('0.75');
  });

  // -------------------------------------------------------------------------
  // registerPolicy + validatePolicies
  // -------------------------------------------------------------------------
  it('registerPolicy: catches zero-duration timeline violation', () => {
    const motion = createMotionEngine({ respectPrefersReducedMotion: false });

    motion.registerPolicy({
      name: 'min-duration',
      validate(tl) {
        return tl.duration <= 0 ? 'Timeline duration must be greater than 0ms' : null;
      }
    });

    const violations = motion.validatePolicies({
      name: 'bad',
      duration: 0,
      keyframes: [{ offset: 0, properties: {} }, { offset: 1, properties: {} }]
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('min-duration');
    expect(violations[0]).toContain('greater than 0ms');
  });

  // -------------------------------------------------------------------------
  // registerTimeline + getTimeline
  // -------------------------------------------------------------------------
  it('registerTimeline: registered timeline is retrievable by name', () => {
    const motion = createMotionEngine({ respectPrefersReducedMotion: false });

    const tl = {
      name: 'hero-enter',
      duration: 400,
      keyframes: [
        { offset: 0, properties: { opacity: 0 } },
        { offset: 1, properties: { opacity: 1 } }
      ]
    };

    motion.registerTimeline(tl);

    expect(motion.getTimeline('hero-enter')).toEqual(tl);
    expect(motion.getTimeline('nonexistent')).toBeUndefined();
  });
});
