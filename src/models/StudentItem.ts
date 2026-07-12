/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IItemType } from './ItemType';
import { IStudent } from '@datalayer/core/lib/models/Student';
import { ISpaceItem } from './SpaceItem';

export type IStudentItem = {
  id: string;
  type: 'student_item';
  student?: IStudent;
  item?: ISpaceItem;
  itemId: string;
  itemType: IItemType;
  score?: number;
  nbgrades?: any;
  nbgradesTotalPoints?: number;
  nbgradesTotalScore?: number;
  completed?: boolean;
  codeStudent?: string;
  pass?: boolean;
  invalid?: boolean;
  invalidReason?: string;
};

export default IStudentItem;
