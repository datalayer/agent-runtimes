/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hook for fetching and managing projects.
 *
 * Projects are backed by the Spacer service as spaces with type_s="project".
 * Projects persist forever — only agents can terminate.
 *
 * Free tier limits: max 3 projects per user.
 *
 * @module hooks/useProjects
 */

import { useMemo, useCallback } from 'react';
import { useCache } from '@datalayer/core/lib/hooks/useCache';

/** The space type value used to identify project spaces in Solr */
export const PROJECT_SPACE_VARIANT = 'project';

const normalizeProjectItems = (items: unknown): any[] => {
  if (Array.isArray(items)) {
    return items;
  }
  if (items && typeof items === 'object') {
    return [items];
  }
  return [];
};

const isProjectSpace = (space: any): boolean => {
  const variant = space?.variant ?? space?.variant_s;
  if (variant !== PROJECT_SPACE_VARIANT) {
    return false;
  }

  const items = normalizeProjectItems(space?.items);
  if (items.length === 0) {
    return true;
  }

  const hasNotebook = items.some(
    item => (item?.type_s ?? item?.type) === 'notebook',
  );
  const hasDocument = items.some(item => {
    const type = item?.type_s ?? item?.type;
    return type === 'document' || type === 'lexical';
  });

  return hasNotebook && hasDocument;
};

/**
 * Project data type (mapped from spacer service space data).
 */
export type ProjectData = {
  /** Space UID (unique identifier) */
  uid: string;
  /** Space ID (internal id used by spacer PUT endpoint) */
  id: string;
  /** Space handle (URL-friendly slug) */
  handle: string;
  /** Project name */
  name: string;
  /** Project description */
  description: string;
  /** Creation date */
  createdAt: Date;
  /** Whether the project is public */
  isPublic: boolean;
  /** Attached agent (runtime) pod name, if any */
  attachedAgentPodName?: string;
  /** Attached agentspec ID (e.g. 'data-acquisition'), if any */
  attachedAgentSpecId?: string;
};

/**
 * Request to create a new project.
 */
export type CreateProjectRequest = {
  /** Project name */
  name: string;
  /** Project description */
  description?: string;
  /** Agentspec to attach (creates agent on project creation) */
  agentSpecId?: string;
};

/**
 * Hook to fetch user's projects (spaces with type "project").
 *
 * Uses the spacer service's spaces endpoint filtered by type.
 */
export function useProjects() {
  const { useUserSpaces } = useCache();
  const { data: allSpaces, ...rest } = useUserSpaces();

  // Filter to only project-type spaces
  const projects: ProjectData[] = useMemo(() => {
    if (!allSpaces) return [];
    return allSpaces
      .filter((space: any) => isProjectSpace(space))
      .map((space: any) => ({
        uid: space.uid,
        id: space.id ?? space.uid,
        handle: space.handle ?? space.handle_s,
        name: space.name ?? space.name_t,
        description: space.description ?? space.description_t ?? '',
        createdAt: space.created_at ? new Date(space.created_at) : new Date(),
        isPublic: space.public ?? space.public_b ?? false,
        attachedAgentPodName: space.attached_agent_pod_name_s || undefined,
        attachedAgentSpecId: space.attached_agent_spec_id_s || undefined,
      }));
  }, [allSpaces]);

  return { data: projects, ...rest };
}

/**
 * Hook to fetch a single project by UID.
 */
export function useProject(uid: string | undefined) {
  const { useSpace } = useCache();
  // useSpace requires a string – pass empty string when uid is undefined
  // (the query is disabled when spaceId is falsy inside useCache)
  const { data: space, ...rest } = useSpace(uid ?? '');

  const project: ProjectData | undefined = useMemo(() => {
    if (!space) return undefined;
    const s = space as any;
    return {
      uid: s.uid,
      id: s.id ?? s.uid,
      handle: s.handle ?? s.handle_s,
      name: s.name ?? s.name_t,
      description: s.description ?? s.description_t ?? '',
      createdAt: s.created_at ? new Date(s.created_at) : new Date(),
      isPublic: s.public ?? s.public_b ?? false,
      attachedAgentPodName: s.attached_agent_pod_name_s || undefined,
      attachedAgentSpecId: s.attached_agent_spec_id_s || undefined,
    };
  }, [space]);

  return { data: project, ...rest };
}

/**
 * Hook to create a new project.
 * Creates a space with type "project" via the spacer service.
 */
export function useCreateProject() {
  const { useCreateSpace } = useCache();
  const createSpaceMutation = useCreateSpace();

  const createProject = useCallback(
    async (request: CreateProjectRequest) => {
      const spaceHandle = request.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      return createSpaceMutation.mutateAsync({
        space: {
          name: request.name,
          description: request.description || '',
          handle: spaceHandle || `project-${Date.now()}`,
          variant: PROJECT_SPACE_VARIANT,
          public: false,
        },
      } as any);
    },
    [createSpaceMutation],
  );

  return {
    ...createSpaceMutation,
    createProject,
  };
}

/**
 * Hook to update a project (e.g. persist the attached agent pod name).
 * Uses the spacer PUT endpoint via useUpdateSpace.
 */
export function useUpdateProject() {
  const { useUpdateSpace } = useCache();
  const updateSpaceMutation = useUpdateSpace();

  /** Assign an agent runtime to the project */
  const assignAgent = useCallback(
    async (
      project: ProjectData,
      agentPodName: string,
      agentSpecId?: string,
    ) => {
      return updateSpaceMutation.mutateAsync({
        id: project.id,
        name: project.name,
        description: project.description,
        attached_agent_pod_name_s: agentPodName,
        attached_agent_spec_id_s: agentSpecId || '',
      } as any);
    },
    [updateSpaceMutation],
  );

  /** Rename a project */
  const renameProject = useCallback(
    async (project: ProjectData, newName: string) => {
      return updateSpaceMutation.mutateAsync({
        id: project.id,
        name: newName,
        description: project.description,
      } as any);
    },
    [updateSpaceMutation],
  );

  /** Remove the agent assignment from the project */
  const unassignAgent = useCallback(
    async (project: ProjectData) => {
      return updateSpaceMutation.mutateAsync({
        id: project.id,
        name: project.name,
        description: project.description,
        attached_agent_pod_name_s: '',
        attached_agent_spec_id_s: '',
      } as any);
    },
    [updateSpaceMutation],
  );

  return {
    ...updateSpaceMutation,
    assignAgent,
    unassignAgent,
    renameProject,
  };
}

/**
 * Hook to refresh the projects list.
 */
export function useRefreshProjects() {
  const { useRefreshUserSpaces } = useCache();
  return useRefreshUserSpaces();
}

/**
 * Hook to delete a project (space) and all its contents.
 */
export function useDeleteProject() {
  const { useDeleteSpace } = useCache();
  return useDeleteSpace();
}

export type { ProjectDefaultItems } from '../models/ProjectDTO';

/**
 * Hook to fetch the default notebook and document UIDs for a project.
 *
 * This calls the spacer `GET /spaces/:uid/default-items` endpoint which
 * returns the UID of the first notebook and first document in the space.
 */
export function useProjectDefaultItems(projectUid: string | undefined) {
  const { useSpaceDefaultItems } = useCache();
  return useSpaceDefaultItems(projectUid);
}
