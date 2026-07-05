/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Utility functions for Spacer-related operations to avoid code duplication.
 * @module client/utils/spacerUtils
 */

import type { GetSpaceItemsResponse } from '../../models/SpaceDTO';
import type { AgentRuntimesClient as DatalayerClient } from '../AgentRuntimesClient';
import { NotebookDTO } from '../../models/NotebookDTO';
import { LexicalDTO } from '../../models/LexicalDTO';
import { ItemTypes } from '@datalayer/core/lib/client/constants';

/**
 * Convert raw space items from API response to model instances.
 * This utility function is shared between Space.getItems() and SpacerMixin.getSpaceItems()
 * to avoid code duplication.
 *
 * @param response - Raw API response containing space items
 * @param client - Client instance to pass to model constructors
 * @returns Array of Notebook and Lexical model instances
 */
export function convertSpaceItemsToModels(
  items: GetSpaceItemsResponse['items'],
  client: DatalayerClient,
): (NotebookDTO | LexicalDTO)[] {
  const modelItems: (NotebookDTO | LexicalDTO)[] = [];

  for (const item of items) {
    // Check various possible type fields
    const itemType: string = (item as any).type_s;

    // Only include notebooks and lexicals
    if (itemType === ItemTypes.NOTEBOOK) {
      modelItems.push(new NotebookDTO(item as any, client));
    } else if (itemType === ItemTypes.LEXICAL) {
      modelItems.push(new LexicalDTO(item as any, client));
    }
    // Skip everything else (exercises, cells, etc.)
  }

  return modelItems;
}
