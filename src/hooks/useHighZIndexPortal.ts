/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hook to ensure Primer's default portal root has a high z-index.
 * This ensures dropdown menus appear above floating chat panels.
 */

import { useEffect } from 'react';
import { PRIMER_PORTAL_ROOT_ID } from '../chat/utils';

export function useHighZIndexPortal() {
  useEffect(() => {
    // Set up a MutationObserver to watch for the portal root being added.
    const setPortalZIndex = () => {
      const portalRoot = document.getElementById(PRIMER_PORTAL_ROOT_ID);
      if (portalRoot) {
        portalRoot.style.zIndex = '9999';
        return true;
      }
      return false;
    };

    // Try immediately.
    if (setPortalZIndex()) {
      return;
    }

    // If not found yet, observe for it.
    const observer = new MutationObserver(() => {
      if (setPortalZIndex()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);
}
