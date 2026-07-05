/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ChangeEvent, useCallback, useEffect } from 'react';
import { FormControl, Select } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useCache, useUser } from '@datalayer/core/lib/hooks';
import { useLayoutStore } from '../../state/substates';
import { IAnySpace } from '../../models';

export const SpaceSelect = () => {
  const user = useUser();
  const { organization, space, updateLayoutSpace } = useLayoutStore();
  const {
    useRefreshUserSpaces,
    useUserSpaces,
    useRefreshOrganizationSpaces,
    useOrganizationSpaces,
  } = useCache();
  const { mutate: refreshUserSpacesMutate } = useRefreshUserSpaces();
  const { mutate: refreshOrganizationSpacesMutate } =
    useRefreshOrganizationSpaces();
  const { data: organizationSpaces = [] } = useOrganizationSpaces(
    organization?.id ?? '',
  );
  const { data: userSpaces = [] } = useUserSpaces();
  const spaces: IAnySpace[] = organization ? organizationSpaces : userSpaces;

  useEffect(() => {
    if (organization?.id) {
      refreshOrganizationSpacesMutate(organization.id);
    } else if (user) {
      refreshUserSpacesMutate();
    }
  }, [
    organization?.id,
    refreshOrganizationSpacesMutate,
    refreshUserSpacesMutate,
    user,
  ]);
  const onSelectionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const selectedSpaceIndex = Number.parseInt(event.target.value, 10);
      const selectedSpace =
        Number.isNaN(selectedSpaceIndex) || selectedSpaceIndex < 0
          ? undefined
          : spaces[selectedSpaceIndex];
      updateLayoutSpace(selectedSpace);
    },
    [spaces, updateLayoutSpace],
  );
  return (
    <>
      <Box as="form">
        <FormControl>
          <FormControl.Label>Select a space</FormControl.Label>
          <FormControl.Caption>
            This will go with you while you navigate
          </FormControl.Caption>
          <Select
            block
            width="medium"
            onChange={onSelectionChange}
            placeholder="Please select an space..."
          >
            {spaces.map((sp, index) => (
              <Select.Option
                key={sp.id}
                value={`${index}`}
                selected={sp.id === space?.id}
              >
                {sp.name}
              </Select.Option>
            ))}
          </Select>
        </FormControl>
      </Box>
    </>
  );
};

export default SpaceSelect;
