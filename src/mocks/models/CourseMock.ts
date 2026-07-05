/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { uniqueNamesGenerator, names } from 'unique-names-generator';
import { ICourse } from '../../models/Course';
import { newUlid } from '@datalayer/core/lib/utils';
import { newSpaceMock } from './SpaceMock';
import { newUserMock } from '@datalayer/core/lib/mocks/models/UserMock';

export const newCourseMock = (name: string) => {
  const course: ICourse = {
    id: newUlid(),
    owner: newUserMock(
      uniqueNamesGenerator({ dictionaries: [names] }),
      uniqueNamesGenerator({ dictionaries: [names] }),
    ),
    handle: newUlid(),
    type: 'space',
    variant: 'course',
    name: name,
    description: name + ' description.',
    public: false,
    creationDate: new Date(),
    items: [],
    itemIds: [],
    seedSpace: newSpaceMock('space content'),
  };
  return course;
};

export const COURSE_1_MOCK = newCourseMock('Course 1');
export const COURSE_2_MOCK = newCourseMock('Course 2');
export const COURSE_3_MOCK = newCourseMock('Course 3');

export const COURSES_MOCK = [COURSE_1_MOCK, COURSE_2_MOCK, COURSE_3_MOCK];
