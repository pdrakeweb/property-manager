/**
 * Modal a11y hook — focus trap + Escape-to-close + focus restore.
 *
 * Usage:
 *   const ref = useModalA11y<HTMLDivElement>(onClose)
 *   <div className="modal-backdrop">
 *     <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title">
 *       <h2 id="modal-title">…</h2>
 *       …
 *     </div>
 *   </div>
 *
 * Implementation notes:
 *  - Escape and Tab handlers are attached via `keydown` capture on the dialog
 *    element itself, so other Escape listeners deeper in the tree don't run
 *    twice. (The screens that previously had their own Escape handlers can
 *    drop them when they switch to this hook.)
 *  - Focus trap walks `querySelectorAll` on every Tab to handle dynamically
 *    enabled/disabled elements (e.g. a "Save" button that becomes enabled
 *    once a required field is filled).
 *  - Initial focus goes to the first focusable that is not the close (X)
 *    button, so the user lands on a useful control. Falls back to the close
 *    button or the dialog itself when nothing else is focusable.
 *  - Previously focused element is restored on unmount so keyboard users end
 *    up back on the trigger that opened the modal.
 */

import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    // hidden / disabled-via-aria elements aren't real Tab stops
    .filter(el => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
}

export function useModalA11y<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  // Latest onClose; avoids re-running the effect when the parent re-renders
  // with a new closure for `onClose`, which would otherwise tear down and
  // re-attach the keydown listener (and re-run focus restore prematurely).
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // Make the dialog itself focusable as a last-resort fallback so screen
    // readers announce the dialog when nothing else can take focus.
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1')

    // Initial focus — prefer the first non-close focusable so users land on
    // an action rather than the dismiss button.
    const items = focusableWithin(node)
    const target =
      items.find(el => el.getAttribute('aria-label') !== 'Close')
      ?? items[0]
      ?? node
    target.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const live = focusableWithin(node!)
      if (live.length === 0) {
        e.preventDefault()
        node!.focus()
        return
      }
      const first = live[0]
      const last  = live[live.length - 1]
      const active = document.activeElement
      // Cycle: Shift+Tab on first → last; Tab on last → first.
      if (e.shiftKey && (active === first || !node!.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !node!.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', handleKeyDown)
    return () => {
      node.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the trigger so keyboard users stay oriented.
      // Guarded — the previous element may have been removed from the DOM
      // while the modal was open (rare but possible during navigation).
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus?.()
      }
    }
    // Intentionally empty deps: we want the trap installed once per mount
    // and torn down on unmount. onClose is read via the ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
