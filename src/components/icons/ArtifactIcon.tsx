/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createElement } from 'react';
import {
  Icon,
  DatabaseIcon,
  RowsIcon,
  BookIcon,
  DiffModifiedIcon,
  PencilIcon,
  FeedIssueDraftIcon,
  FeedRocketIcon,
  MilestoneIcon,
  OrganizationIcon,
  PeopleIcon,
  RocketIcon,
  FileIcon,
  StackIcon,
  GearIcon,
  GraphIcon,
  NumberIcon,
  PaperAirplaneIcon,
  ArchiveIcon,
  TagIcon,
  MortarBoardIcon,
  ContainerIcon,
  HomeIcon,
  ShareIcon,
  FileDirectoryIcon,
  TrophyIcon,
  QuestionIcon,
  PersonIcon,
  MailIcon,
  ZapIcon,
} from '@primer/octicons-react';
import {
  GalileoIcon,
  CircleWhiteIcon,
  BookOpenIcon,
  CameraIcon,
  CellIcon,
  NotebookOutlineIcon,
} from '@datalayer/icons-react';
import { IAnyItem, IItemType } from '../../models';

const ARTIFACT_ICONS = new Map<IItemType, Icon>([
  ['assignment', MilestoneIcon],
  ['authoring', PencilIcon],
  ['cell', CellIcon],
  ['content', ArchiveIcon],
  ['credits', NumberIcon],
  ['dataset', StackIcon],
  ['datasource', DatabaseIcon],
  ['document', FileIcon],
  ['documentation', BookOpenIcon],
  ['environment', ContainerIcon],
  ['exercise', DiffModifiedIcon],
  ['growth', FeedRocketIcon],
  ['home', HomeIcon],
  ['invite', PaperAirplaneIcon],
  ['runtime', RocketIcon],
  ['runtime-snapshot', CameraIcon],
  ['library', BookIcon],
  ['lesson', MortarBoardIcon],
  ['mail', MailIcon],
  ['management', FeedIssueDraftIcon],
  ['notebook', RowsIcon],
  ['organization', OrganizationIcon],
  ['onboarding', ZapIcon],
  ['page', NotebookOutlineIcon],
  ['settings', GearIcon],
  ['share', ShareIcon],
  ['space', GalileoIcon],
  ['success', TrophyIcon],
  ['support', QuestionIcon],
  ['storage', FileDirectoryIcon],
  ['tag', TagIcon],
  ['team', PeopleIcon],
  ['usage', GraphIcon],
  ['user', PersonIcon],
  ['undefined', CircleWhiteIcon],
]);

type IArtifactIconClassProp = {
  item?: IAnyItem;
  type?: IItemType;
  size?: number | 'small' | 'medium' | 'large';
};

export const ArtifactIconClass = (props: IArtifactIconClassProp): Icon => {
  const { item, type } = props;
  const itemType = item?.type ?? type ?? 'undefined';
  const icon = ARTIFACT_ICONS.get(itemType);
  return icon ?? CircleWhiteIcon;
};

export function ArtifactIcon(props: IArtifactIconClassProp): JSX.Element {
  const { size } = props;
  const artifactIconClass = ArtifactIconClass(props);
  return createElement(artifactIconClass, {
    size: size ?? 16,
  });
}

export default ArtifactIcon;
