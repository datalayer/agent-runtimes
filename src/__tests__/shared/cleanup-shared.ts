/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { snapshots, runtimes } from '@datalayer/core/lib/api/runtimes';
import { users, items } from '@datalayer/core/lib/api/spacer';
import { testConfig } from './test-config';

/**
 * Shared cleanup logic for both setup and teardown
 */
export async function performCleanup(phase: 'setup' | 'teardown') {
  const phaseLabel = phase === 'setup' ? 'PRE-TEST' : 'POST-TEST';

  console.log('='.repeat(60));
  console.log(
    `${phaseLabel} CLEANUP: Starting ${phase === 'setup' ? 'pre' : 'post'}-test cleanup...`,
  );
  console.log('='.repeat(60));

  // Check if we have a token
  if (!testConfig.hasToken()) {
    console.log(
      'WARNING: No Datalayer API token configured - skipping cleanup',
    );
    return;
  }

  const DATALAYER_API_KEY = testConfig.getToken();
  const RUNTIMES_BASE_URL = testConfig.getBaseUrl('RUNTIMES');
  const SPACER_BASE_URL = testConfig.getBaseUrl('SPACER');

  // Clean up runtimes
  await cleanupRuntimes(DATALAYER_API_KEY, RUNTIMES_BASE_URL, phaseLabel);

  // Clean up test snapshots
  await cleanupTestSnapshots(DATALAYER_API_KEY, RUNTIMES_BASE_URL, phaseLabel);

  // Clean up ALL spacer items (notebooks, lexicals, etc.)
  await cleanupSpacerItems(DATALAYER_API_KEY, SPACER_BASE_URL, phaseLabel);

  // Final verification (only for teardown)
  if (phase === 'teardown') {
    await verifyFinalState(
      DATALAYER_API_KEY,
      RUNTIMES_BASE_URL,
      SPACER_BASE_URL,
    );
  }

  console.log('='.repeat(60));
  console.log(
    `${phaseLabel} CLEANUP: ${phase === 'setup' ? 'Pre' : 'Post'}-test cleanup completed`,
  );
  console.log('='.repeat(60));
}

async function cleanupRuntimes(
  token: string,
  baseUrl: string,
  phaseLabel: string,
) {
  try {
    console.log(
      `Cleaning up ${phaseLabel === 'PRE-TEST' ? 'existing' : 'test'} runtimes...`,
    );
    const runtimesResponse = await runtimes.listRuntimes(token, baseUrl);

    if (!runtimesResponse.runtimes || runtimesResponse.runtimes.length === 0) {
      console.log('✓ No runtimes to clean up');
      return;
    }

    console.log(
      `Found ${runtimesResponse.runtimes.length} runtime(s) to clean up`,
    );

    let removedCount = 0;
    let failedCount = 0;

    for (const runtime of runtimesResponse.runtimes) {
      try {
        await runtimes.deleteRuntime(token, runtime.pod_name, baseUrl);
        console.log(`  ✓ Removed runtime: ${runtime.pod_name}`);
        removedCount++;
      } catch (error: any) {
        console.log(
          `  ✗ Failed to remove runtime ${runtime.pod_name}: ${error.message}`,
        );
        failedCount++;
      }
    }

    if (removedCount > 0 || failedCount > 0) {
      console.log(
        `Runtime cleanup summary: ${removedCount} removed, ${failedCount} failed`,
      );
    }
  } catch (error: any) {
    console.error('Error cleaning up runtimes:', error.message);
  }
}

async function cleanupTestSnapshots(
  token: string,
  baseUrl: string,
  phaseLabel: string,
) {
  try {
    console.log(
      `Cleaning up ALL snapshots${phaseLabel === 'POST-TEST' ? ' created during tests' : ''}...`,
    );
    const snapshotsResponse = await snapshots.listSnapshots(token, baseUrl);

    if (
      !snapshotsResponse.snapshots ||
      snapshotsResponse.snapshots.length === 0
    ) {
      console.log('✓ No snapshots found');
      return;
    }

    // Filter out already deleted snapshots
    const allSnapshots = snapshotsResponse.snapshots.filter(
      s => s.status !== 'deleted',
    );

    if (allSnapshots.length === 0) {
      const deletedCount = snapshotsResponse.snapshots.filter(
        s => s.status === 'deleted',
      ).length;
      if (deletedCount > 0) {
        console.log(
          `Found ${deletedCount} already deleted snapshot(s), skipping`,
        );
      }
      console.log('✓ No active snapshots to clean up');
      return;
    }

    console.log(`Found ${allSnapshots.length} active snapshot(s) to clean up`);

    let removedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const snapshot of allSnapshots) {
      try {
        console.log(
          `  Attempting to delete: ${snapshot.name} (uid: ${snapshot.uid}, status: ${snapshot.status})`,
        );
        await snapshots.deleteSnapshot(token, snapshot.uid, baseUrl);
        console.log(`  ✓ Removed snapshot: ${snapshot.name}`);
        removedCount++;
      } catch (error: any) {
        if (
          error.message?.includes('404') ||
          error.message?.includes('not found')
        ) {
          console.log(`  - Already removed: ${snapshot.name}`);
          skippedCount++;
        } else {
          console.log(
            `  ✗ Failed to remove snapshot ${snapshot.name}: ${error.message}`,
          );
          failedCount++;
        }
      }
    }

    if (removedCount > 0 || skippedCount > 0 || failedCount > 0) {
      console.log(
        `Snapshot cleanup summary: ${removedCount} removed, ${skippedCount} skipped, ${failedCount} failed`,
      );

      // Verify snapshots are actually deleted
      console.log('Verifying snapshot deletion...');
      const verifyResponse = await snapshots.listSnapshots(token, baseUrl);
      const remainingCount = verifyResponse.snapshots?.length || 0;
      console.log(`  Remaining snapshots after cleanup: ${remainingCount}`);
      if (remainingCount > 0 && verifyResponse.snapshots) {
        console.log('  Still present:');
        for (const snap of verifyResponse.snapshots.slice(0, 5)) {
          console.log(
            `    - ${snap.name} (uid: ${snap.uid}, status: ${snap.status})`,
          );
        }
        if (verifyResponse.snapshots.length > 5) {
          console.log(
            `    ... and ${verifyResponse.snapshots.length - 5} more`,
          );
        }
      }
    }
  } catch (error: any) {
    console.error('Error cleaning up snapshots:', error.message);
  }
}

async function cleanupSpacerItems(
  token: string,
  baseUrl: string,
  phaseLabel: string,
) {
  try {
    console.log(
      `Cleaning up ALL spacer items${phaseLabel === 'POST-TEST' ? ' (complete cleanup)' : ''}...`,
    );

    // Get user spaces
    const spacesResponse = await users.getMySpaces(token, baseUrl);

    if (!spacesResponse.spaces || spacesResponse.spaces.length === 0) {
      console.log('✓ No spaces found');
      return;
    }

    console.log(`Found ${spacesResponse.spaces.length} space(s)`);

    let totalRemovedCount = 0;
    let totalFailedCount = 0;

    // Go through each space and clean up test items
    for (const space of spacesResponse.spaces) {
      try {
        const itemsResponse = await items.getSpaceItems(
          token,
          space.uid,
          baseUrl,
        );

        if (!itemsResponse.items || itemsResponse.items.length === 0) {
          continue;
        }

        const spaceName =
          (space as any).name || (space as any).name_t || 'Unknown Space';
        console.log(
          `  Space "${spaceName}": Found ${itemsResponse.items.length} item(s) to clean up`,
        );

        for (const item of itemsResponse.items) {
          try {
            // API returns uid field but TypeScript interface doesn't include it
            await items.deleteItem(token, (item as any).uid, baseUrl);
            console.log(
              `    ✓ Removed item: ${(item as any).name || (item as any).name_t}`,
            );
            totalRemovedCount++;
          } catch (error: any) {
            console.log(
              `    ✗ Failed to remove item ${(item as any).name || (item as any).name_t}: ${error.message}`,
            );
            totalFailedCount++;
          }
        }
      } catch (error: any) {
        const spaceName =
          (space as any).name || (space as any).name_t || 'Unknown Space';
        console.log(`  Error processing space ${spaceName}: ${error.message}`);
      }
    }

    if (totalRemovedCount > 0 || totalFailedCount > 0) {
      console.log(
        `Spacer items cleanup summary: ${totalRemovedCount} removed, ${totalFailedCount} failed`,
      );
    } else {
      console.log('✓ No spacer items to clean up');
    }
  } catch (error: any) {
    console.error('Error cleaning up spacer items:', error.message);
  }
}

async function verifyFinalState(
  token: string,
  runtimesBaseUrl: string,
  spacerBaseUrl: string,
) {
  try {
    const finalRuntimes = await runtimes.listRuntimes(token, runtimesBaseUrl);
    const finalSnapshots = await snapshots.listSnapshots(
      token,
      runtimesBaseUrl,
    );

    const remainingRuntimes = finalRuntimes.runtimes?.length || 0;
    const remainingSnapshots = (finalSnapshots.snapshots || []).filter(
      s => s.status !== 'deleted',
    ).length;

    // Count spacer test items
    let remainingTestItems = 0;
    try {
      const spacesResponse = await users.getMySpaces(token, spacerBaseUrl);
      if (spacesResponse.spaces) {
        for (const space of spacesResponse.spaces) {
          try {
            const itemsResponse = await items.getSpaceItems(
              token,
              space.uid,
              spacerBaseUrl,
            );
            if (itemsResponse.items) {
              remainingTestItems += itemsResponse.items.length;
            }
          } catch (error) {
            // Ignore errors for individual spaces
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }

    console.log('-'.repeat(60));
    console.log('Final state after all tests:');
    console.log(`  - Remaining runtimes: ${remainingRuntimes}`);
    console.log(`  - Remaining active snapshots: ${remainingSnapshots}`);
    console.log(
      `  - Total snapshots: ${finalSnapshots.snapshots?.length || 0}`,
    );
    console.log(`  - Remaining spacer items: ${remainingTestItems}`);

    if (remainingRuntimes > 0) {
      console.log(
        `\nNOTE: ${remainingRuntimes} runtime(s) still active. These may require manual cleanup.`,
      );
    }

    if (remainingSnapshots > 0) {
      console.log(
        `\nNOTE: ${remainingSnapshots} snapshot(s) still active. These may require manual cleanup.`,
      );
    }

    if (remainingTestItems > 0) {
      console.log(
        `\nNOTE: ${remainingTestItems} spacer item(s) still active. These may require manual cleanup.`,
      );
    }
  } catch (error: any) {
    console.error('Error during final verification:', error.message);
  }
}
