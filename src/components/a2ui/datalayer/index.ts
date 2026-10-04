/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Datalayer's own components, drawn (LOOP C-18): a renderer for each the
 * catalog has beside A2UI's basic ones — Table, Chart, File upload, Chat,
 * Evidence and Form — made as A2UI makes its own, so that the decision
 * surface, an application's page, the Surface view and the components page
 * draw them as they draw a Button.
 *
 * @module components/a2ui/datalayer
 */

import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { OWN_COMPONENT_IDS } from './schema';
import { DRAWN_OWN_COMPONENTS, type DrawnOwnComponent } from './drawn';
import { Table } from './Table';
import { Chart } from './Chart';
import { FileUpload } from './FileUpload';
import { Chat } from './Chat';
import { Evidence } from './Evidence';
import { Form } from './Form';

const RENDERERS: Record<DrawnOwnComponent, ReactComponentImplementation> = {
  Table,
  Chart,
  FileUpload,
  Chat,
  Evidence,
  Form,
};

/**
 * A renderer for every component of Datalayer's own the catalog has, in the
 * catalog's order. A component the catalog adds without a renderer here, or
 * a renderer for one it no longer has, fails at once.
 */
export const OWN_COMPONENTS: ReactComponentImplementation[] = (() => {
  const drawn: readonly string[] = DRAWN_OWN_COMPONENTS;
  const missing = OWN_COMPONENT_IDS.filter(id => !drawn.includes(id));
  if (missing.length) {
    throw new Error(
      `The catalog has ${missing.join(', ')}, which no renderer draws.`,
    );
  }
  const stray = drawn.filter(id => !OWN_COMPONENT_IDS.includes(id));
  if (stray.length) {
    throw new Error(
      `A renderer draws ${stray.join(', ')}, which the catalog does not have.`,
    );
  }
  return OWN_COMPONENT_IDS.map(id => RENDERERS[id as DrawnOwnComponent]);
})();

export { OWN_COMPONENT_IDS, ownComponentSchema } from './schema';
export { DRAWN_OWN_COMPONENTS, type DrawnOwnComponent } from './drawn';
export { chartOption, chartPoints, chartSeries } from './Chart';
export { chatItems } from './Chat';
export { evidenceSources } from './Evidence';
export { refusal as fileRefusal, type GivenFile } from './FileUpload';
export { tableRows } from './Table';
