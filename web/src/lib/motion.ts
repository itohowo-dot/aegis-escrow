import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * Motion is choreography, not decoration.
 *
 * Everything uses gsap.from(), so the resting state IS the natural DOM state:
 * if JS never runs, content is simply visible. Nothing's visibility is gated on
 * a tween firing.
 *
 * There is deliberately no page-load entrance. Product UI loads into a task;
 * choreographing the shell on first paint makes the user wait to start. Motion
 * here only reports a state change — data arriving, or the record swapping.
 *
 * Note we check reduced-motion directly rather than via gsap.matchMedia(): its
 * cleanup reverts, and these effects re-run on every data change, so a revert
 * would snap in-flight tweens back and cancel the very animation it set up.
 *
 * Everything uses fromTo() with BOTH endpoints stated, never from(). from()
 * infers its destination from whatever the element's opacity happens to be when
 * it runs — so if it fires while an earlier tween is mid-flight (StrictMode's
 * double-invoke, or a user clicking through escrows quickly) it records the
 * in-between value as the target and strands the element there. A panel frozen
 * at 13% opacity is not a hypothetical; it's what this did before.
 */

const wantsMotion = () =>
  typeof window !== 'undefined' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Stagger rows as they arrive. Tracks how many have already been seen so only
 * newly appended rows animate — settled rows must not re-run when a page loads.
 *
 * No cleanup on purpose: each batch animates a disjoint set, so killing on
 * re-run would strand the previous batch at a partial opacity. Tweens on
 * unmounted nodes simply finish and get collected.
 */
export function useRowStagger(scope: React.RefObject<HTMLElement>, count: number) {
  const seen = useRef(0);

  useEffect(() => {
    const from = seen.current;
    if (count <= from) {
      seen.current = count; // list shrank (filtered) — reset the watermark
      return;
    }
    seen.current = count;
    if (!wantsMotion()) return;

    const rows = gsap.utils.toArray<HTMLElement>('.row', scope.current).slice(from);
    if (!rows.length) return;

    gsap.fromTo(
      rows,
      { opacity: 0, y: 8 },
      {
        opacity: 1,
        y: 0,
        duration: 0.45,
        ease: 'expo.out',
        // 30ms reads as a wave; more and the list feels slow to arrive
        stagger: 0.03,
        overwrite: 'auto',
        clearProps: 'all',
      },
    );
  }, [scope, count]);
}

/**
 * Crossfade the detail panel when a different escrow is selected.
 *
 * A swap, not a count-up: the two figures are unrelated records, and
 * interpolating between them would render amounts that were never real.
 */
export function useDetailSwap(scope: React.RefObject<HTMLElement>, id: number) {
  useEffect(() => {
    if (!wantsMotion() || !scope.current) return;

    gsap.fromTo(
      scope.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'expo.out', overwrite: 'auto', clearProps: 'all' },
    );
    gsap.fromTo(
      gsap.utils.toArray<HTMLElement>('.tl li', scope.current),
      { opacity: 0, x: -6 },
      {
        opacity: 1,
        x: 0,
        duration: 0.4,
        ease: 'expo.out',
        stagger: 0.05,
        delay: 0.08,
        overwrite: 'auto',
        clearProps: 'all',
      },
    );
  }, [scope, id]);
}
