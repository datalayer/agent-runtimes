/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { IBaseSpace } from './Space';
import { Instructor } from '@datalayer/core/lib/models/Instructor';
import { IStudent } from '@datalayer/core/lib/models/Student';
import { ISchool } from '@datalayer/core/lib/models/School';
import { ISpace } from './Space';
import { ISpaceItem } from './SpaceItem';

export type ICourse = IBaseSpace & {
  type: 'space';
  variant: 'course';
  seedSpace?: ISpace;
  school?: ISchool;
  instructor?: Instructor;
  students?: Map<string, IStudent>;
  items: Array<ISpaceItem>;
  itemIds: Array<string>;
};

export default ICourse;
