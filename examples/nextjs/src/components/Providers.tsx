/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import {
  ThemeProvider as PrimerThemeProvider,
  BaseStyles,
  theme,
} from '@primer/react';
import { usePathname } from 'next/navigation';
import { ActiveNotebookProvider } from '@/contexts/ActiveNotebookContext';
import AppNavBar from '@/components/AppNavBar';
import Footer from '@/components/Footer';

function PrimerThemeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PrimerThemeProvider theme={theme} colorMode="light">
      <BaseStyles>{children}</BaseStyles>
    </PrimerThemeProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Pages that should show the navbar when authenticated
  const authenticatedPages = ['/notebooks', '/viewer', '/environments'];
  const shouldShowNavbar = authenticatedPages.some(page =>
    pathname?.startsWith(page),
  );

  return (
    <ActiveNotebookProvider>
      <PrimerThemeWrapper>
        {shouldShowNavbar && <AppNavBar />}
        {children}
        <Footer />
      </PrimerThemeWrapper>
    </ActiveNotebookProvider>
  );
}
