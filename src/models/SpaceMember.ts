/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Member } from '@datalayer/core/lib/models/Member';
import { ISpace } from './Space';

export type SpaceMember = Member & {
  space?: ISpace;
};

export default SpaceMember;
