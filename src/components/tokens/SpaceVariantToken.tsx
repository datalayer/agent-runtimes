/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Token } from '@primer/react';
import { ProjectIcon } from '@primer/octicons-react';
import { StudentIcon } from '@datalayer/icons-react';
import { ISpaceVariant } from '../../models';

export const SpaceVariantToken = (props: {
  variant: ISpaceVariant | string;
}) => {
  const variant = String(props.variant || 'default').toLowerCase();

  if (variant.includes('project')) {
    return <Token text="project" leadingVisual={ProjectIcon} />;
  }

  switch (variant) {
    case 'default':
      return <Token text="default" />;
    case 'course':
      return <Token text="course" leadingVisual={StudentIcon} />;
    default:
      return <Token text={String(variant || 'default')} />;
  }
};

export default SpaceVariantToken;
