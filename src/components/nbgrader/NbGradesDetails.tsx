/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Heading, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { IStudentItem } from '../../models';

export const NbGradesDetails = (props: { studentItem?: IStudentItem }) => {
  const { studentItem } = props;
  const nbgrades = Array.isArray(studentItem?.nbgrades)
    ? studentItem.nbgrades
    : [];
  const totalScore = studentItem?.nbgradesTotalScore ?? 0;
  const totalPoints = studentItem?.nbgradesTotalPoints ?? 0;
  return studentItem ? (
    <Box>
      <Box>
        <Heading sx={{ fontSize: 1 }}>Grades</Heading>
      </Box>
      <Box mt={3}>
        {nbgrades.length > 0 ? (
          nbgrades.map(nb => {
            return (
              <Box>
                <Text sx={{ fontSize: 'small' }}>
                  {nb.grade_id_s}: {nb.score_f}
                </Text>
              </Box>
            );
          })
        ) : (
          <Text sx={{ fontSize: 'small' }}>No grade checks were returned.</Text>
        )}
      </Box>
      <Box mt={3}>
        <Heading sx={{ fontSize: 1 }}>Total</Heading>
      </Box>
      <Box mt={3}>
        {totalScore} / {totalPoints}
      </Box>
    </Box>
  ) : (
    <Box>
      <Box>
        <Heading sx={{ fontSize: 1 }}>Grades</Heading>
      </Box>
      <Box mt={3}>Please grade your assignment.</Box>
    </Box>
  );
};

export default NbGradesDetails;
