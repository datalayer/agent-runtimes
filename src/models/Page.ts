/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { INotebookContent } from '@jupyterlab/nbformat';
import { IUser, asUser } from '@datalayer/core/lib/models/User';
import { PageTagName } from './PageTag';
import {
  asCodeSandboxSnapshot,
  ICodeSandboxSnapshot,
} from './CodeSandboxSnapshot';

export type PageTheme = 'default';

export type PageVariant = 'document' | 'cell' | 'notebook';

/**
 * Page attributes.
 *
 * - Notebook
 * - Screen Capture
 * - Theme
 * - Tags
 * - Video Explainer
 * - Kernel Launcher Button
 * - Kernel Snapshot
 * - Share Button
 * - Stars Counter - 1 ⭐ -> 1 Credit
 */
export type IPage = {
  id: string;
  variant: PageVariant;
  type: 'page';
  name: string;
  description: string;
  theme: PageTheme;
  tags: Array<PageTagName>;
  nbformat: INotebookContent;
  screenCapture?: string;
  creator?: IUser;
  creatorId?: string;
  selectedPrincipalUid?: string;
  selectedPrincipalKind?: 'personal' | 'organization' | 'team';
  selectedOrganizationUid?: string;
  kernelSnapshot?: ICodeSandboxSnapshot;
  kernelSnapshotId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const asPage = (s: any): IPage => {
  return {
    id: s.uid,
    type: 'page',
    variant: s.variant_s,
    name: s.name_t,
    description: s.description_t,
    theme: s.theme_s,
    nbformat: s.nbformat_s ? JSON.parse(s.nbformat_s) : undefined,
    screenCapture: s.screen_capture_cdn_url_s || s.screen_capture_s,
    tags: s.tags_ss ?? [],
    creator: s.creator ? asUser(s.creator) : undefined,
    creatorId: s.creator_uid,
    kernelSnapshot: s.kernel_snapshot
      ? asCodeSandboxSnapshot(s.kernel_snapshot)
      : undefined,
    kernelSnapshotId: s.kernel_snapshot_uid,
  };
};

export default IPage;
