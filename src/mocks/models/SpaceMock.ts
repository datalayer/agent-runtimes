/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { uniqueNamesGenerator, names } from 'unique-names-generator';
import { ISpace } from '../../models/Space';
import { newUlid } from '@datalayer/core/lib/utils';
import { newUserMock } from '@datalayer/core/lib/mocks/models/UserMock';

export const newSpaceMock = (name: string) => {
  const space: ISpace = {
    id: newUlid(),
    owner: newUserMock(
      uniqueNamesGenerator({ dictionaries: [names] }),
      uniqueNamesGenerator({ dictionaries: [names] }),
    ),
    handle: newUlid(),
    type: 'space',
    variant: 'default',
    name: name,
    description: name + ' description.',
    public: false,
    creationDate: new Date(),
  };
  return space;
};

export const SPACE_1_MOCK = newSpaceMock('Space 1');
export const SPACE_2_MOCK = newSpaceMock('Space 2');
export const SPACE_3 = newSpaceMock('Space 3');

export const SPACES_MOCK = [SPACE_1_MOCK, SPACE_2_MOCK, SPACE_3];
