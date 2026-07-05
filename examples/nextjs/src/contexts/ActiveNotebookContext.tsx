/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface ActiveNotebook {
  id: string;
  name: string;
  environment: string;
  runtimeId?: string;
  podName?: string;
  viewerUrl: string;
}

interface ActiveNotebookContextType {
  activeNotebook: ActiveNotebook | null;
  setActiveNotebook: (notebook: ActiveNotebook | null) => void;
  clearActiveNotebook: () => void;
}

const ActiveNotebookContext = createContext<
  ActiveNotebookContextType | undefined
>(undefined);

export function ActiveNotebookProvider({ children }: { children: ReactNode }) {
  const [activeNotebook, setActiveNotebook] = useState<ActiveNotebook | null>(
    null,
  );

  const clearActiveNotebook = () => {
    setActiveNotebook(null);
  };

  return (
    <ActiveNotebookContext.Provider
      value={{ activeNotebook, setActiveNotebook, clearActiveNotebook }}
    >
      {children}
    </ActiveNotebookContext.Provider>
  );
}

export function useActiveNotebook() {
  const context = useContext(ActiveNotebookContext);
  if (context === undefined) {
    throw new Error(
      'useActiveNotebook must be used within an ActiveNotebookProvider',
    );
  }
  return context;
}
