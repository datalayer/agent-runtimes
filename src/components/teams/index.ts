/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A team of applications over A2A, drawn and run in a page.
 *
 * Not re-exported by `components/index.ts`: it brings React Flow, which a
 * page that shows no team should not load. Import it from here.
 *
 * @module components/teams
 */

export * from './a2aTeamFlow';
export * from './teamConnections';
export * from './useA2ATeam';
export * from './A2ATeamGraph';
