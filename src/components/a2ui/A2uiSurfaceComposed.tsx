/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useRef } from 'react';
import {
  A2uiSurface,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9';
import type { SurfaceModel } from '@a2ui/web_core/v0_9';

function applyA2uiClassFallbacks(root: HTMLElement) {
  root.querySelectorAll('button').forEach(el => {
    el.classList.remove('undefined');

    const btn = el as HTMLButtonElement;

    // Tab headers are not regular primary buttons: they need to convey which
    // one is selected. Leave them to the `.a2ui-tab-button` scope styles and
    // clear inline declarations so the class-driven active state can apply.
    if (btn.classList.contains('a2ui-tab-button')) {
      btn.style.removeProperty('background');
      btn.style.removeProperty('border');
      btn.style.removeProperty('color');
      btn.style.removeProperty('border-radius');
      return;
    }

    // Choice-picker chips are toggle buttons whose selected/unselected state is
    // driven by React (class `selected` + `aria-pressed`). Do NOT coerce them
    // into primary buttons: React rewrites their className on every toggle,
    // which would drop injected classes, and the observer does not watch
    // attribute mutations. Let the `.chip` scope styles handle both states.
    if (btn.classList.contains('chip')) {
      btn.style.removeProperty('background');
      btn.style.removeProperty('background-color');
      btn.style.removeProperty('border');
      btn.style.removeProperty('color');
      return;
    }

    if (!el.classList.contains('a2ui-button')) {
      el.classList.add('a2ui-button');
    }
    if (!el.classList.contains('a2ui-button-primary')) {
      el.classList.add('a2ui-button-primary');
    }

    // Ensure class-driven theming can react live to CSS variable changes by
    // clearing any stale inline declarations from previous renders.
    btn.style.removeProperty('background');
    btn.style.removeProperty('border');
    btn.style.removeProperty('color');
    btn.style.removeProperty('border-radius');
    btn.style.removeProperty('padding');
    btn.style.removeProperty('font-weight');
    btn.style.removeProperty('cursor');
  });

  root
    .querySelectorAll(
      "input[type='text'], input[type='number'], input[type='password'], input[type='datetime-local'], textarea",
    )
    .forEach(el => {
      el.classList.remove('undefined');
      if (!el.classList.contains('a2ui-textfield-input')) {
        el.classList.add('a2ui-textfield-input');
      }
    });

  root.querySelectorAll('label').forEach(el => {
    el.classList.remove('undefined');
    if (!el.classList.contains('a2ui-textfield-label')) {
      el.classList.add('a2ui-textfield-label');
    }
  });

  root.querySelectorAll('span').forEach(el => {
    if (el.textContent && /invalid|required|error/i.test(el.textContent)) {
      if (!el.classList.contains('a2ui-textfield-error')) {
        el.classList.add('a2ui-textfield-error');
      }
    }
  });

  root.querySelectorAll('.body, .caption').forEach(el => {
    el.classList.remove('undefined');
    if (!el.classList.contains('a2ui-text')) {
      el.classList.add('a2ui-text');
    }
    if (
      el.classList.contains('caption') &&
      !el.classList.contains('a2ui-caption')
    ) {
      el.classList.add('a2ui-caption');
    }
  });
}

export interface A2uiSurfaceComposedProps {
  surface: SurfaceModel<ReactComponentImplementation>;
}

/**
 * Composed surface wrapper for all A2UI v0.9 consumers.
 *
 * This normalizes class names when upstream CSS modules are absent and applies
 * basic semantic classes so application-level styles can consistently target
 * rendered A2UI HTML.
 */
export function A2uiSurfaceComposed({ surface }: A2uiSurfaceComposedProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const apply = () => applyA2uiClassFallbacks(root);
    apply();

    const observer = new MutationObserver(() => {
      apply();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [surface]);

  return (
    <div ref={rootRef}>
      <A2uiSurface surface={surface} />
    </div>
  );
}
