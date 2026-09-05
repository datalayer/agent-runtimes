/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { SpaceMember } from './SpaceMember';
import { ISpaceItem } from './SpaceItem';
import { ICourse as ICourse } from './Course';
import { IOrganization } from '@datalayer/core/lib/models/Organization';
import { asUser, IUser } from '@datalayer/core/lib/models/User';
import { asArray } from '@datalayer/core/lib/utils';

/**
 * Convert the raw space object to {@link ISpace}.
 *
 * @param user Raw space object from DB
 * @returns Space
 */
export const asSpace = (raw_space: any): ISpace => {
  const sharedOwnerUserUids = asArray(
    raw_space?.shared_owner_user_uids_ss ||
      raw_space?.shared_ower_user_uids_ss ||
      [],
  ).filter(
    (uid: unknown): uid is string => typeof uid === 'string' && uid.length > 0,
  );

  // The backend resolves the canonical (friendly) account handles and exposes
  // them as `space.owner` and `space.organization`. Trust those single sources
  // of truth; do not invent fallbacks here.
  const organizationHandle = raw_space?.organization?.handle;
  const owner: IUser = raw_space?.owner
    ? asUser(raw_space.owner)
    : ({
        id: '',
        handle: '',
        email: '',
        firstName: '',
        lastName: '',
        initials: '',
        displayName: '',
        roles: [],
        iamProviders: [],
        setRoles: () => {},
        unsubscribedFromOutbounds: false,
        onboarding: {} as any,
        events: [],
        settings: {},
      } as IUser);
  let members = new Array<SpaceMember>();
  if (raw_space.members) {
    members = asArray(raw_space.members).map(m => {
      const member: SpaceMember = asUser(m);
      return member;
    });
  }
  const space: ISpace = {
    id: raw_space.uid,
    handle: raw_space.handle_s,
    type: 'space',
    variant: raw_space.variant_s,
    name: raw_space.name_t,
    description: raw_space.description_t,
    public: raw_space.public_b,
    members,
    creationDate: new Date(raw_space.creation_ts_dt),
    owner,
    organization: organizationHandle
      ? { handle: organizationHandle }
      : undefined,
    sharedOwnerUserUids,
    // Preserve raw Solr fields so consumers can access dynamic fields
    // (e.g. attached_agent_runtime_name_s for project-agent assignment)
    ...raw_space,
  };
  return space;
};

export type ISpaceVariant = 'default' | 'course' | 'project';

export type IAnySpace = ISpace | ICourse;

export type IBaseSpace = {
  id: string;
  handle: string;
  type: string;
  variant: ISpaceVariant;
  name: string;
  description: string;
  creationDate: Date;
  public: boolean;
  owner: IUser;
  organization?: Partial<IOrganization>;
  members?: SpaceMember[];
  sharedOwnerUserUids?: string[];
};

export type ISpace = IBaseSpace & {
  type: 'space';
  variant: 'default';
  items?: Array<ISpaceItem>;
  itemIds?: Array<string>;
};

export default ISpace;
