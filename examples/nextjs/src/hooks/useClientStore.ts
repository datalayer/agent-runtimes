/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import { useEffect, useState } from 'react';

// This hook ensures stores are only accessed on the client side
export function useClientStore<T>(storeHook: () => T): T | null {
  const [store, setStore] = useState<T | null>(null);

  useEffect(() => {
    setStore(storeHook());
  }, [storeHook]);

  return store;
}
