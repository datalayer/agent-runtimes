/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ISpaceItem } from './SpaceItem';
import { IUser } from '@datalayer/core/lib/models/User';
import { IAnyOrganization } from '@datalayer/core/lib/models/Organization';
import { IAnySpace } from './Space';
import { IItemType } from './ItemType';

export type IAnyItem = ISpaceItem;

export type IItem = {
  id: string;
  type: IItemType;
  name: string;
  description: string;
  public: boolean;
  creationDate: Date;
  lastUpdateDate?: Date;
  lastPublicationDate?: Date;
  owner: IUser;
  space: Partial<IAnySpace>;
  organization: Partial<IAnyOrganization>;
};

export default IItem;
