/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  basicCatalog,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9';
import {
  MessageProcessor,
  type A2uiClientAction,
  type A2uiMessage,
  type SurfaceModel,
} from '@a2ui/web_core/v0_9';

export type A2uiProcessor = MessageProcessor<ReactComponentImplementation>;
export type A2uiSurfaceModel = SurfaceModel<ReactComponentImplementation>;

export function useA2uiProcessor(
  onAction?: (action: A2uiClientAction) => void,
) {
  const processor = useMemo(
    () =>
      new MessageProcessor<ReactComponentImplementation>(
        [basicCatalog],
        onAction,
      ),
    [onAction],
  );

  const [surfaces, setSurfaces] = useState<A2uiSurfaceModel[]>(() =>
    Array.from(processor.model.surfacesMap.values()),
  );

  useEffect(() => {
    const createdSub = processor.onSurfaceCreated(surface => {
      setSurfaces(prev => [...prev, surface]);
    });
    const deletedSub = processor.onSurfaceDeleted(id => {
      setSurfaces(prev => prev.filter(surface => surface.id !== id));
    });
    return () => {
      createdSub.unsubscribe();
      deletedSub.unsubscribe();
    };
  }, [processor]);

  const processMessages = useCallback(
    (messages: A2uiMessage[]) => {
      processor.processMessages(messages);
    },
    [processor],
  );

  const resetSurfaces = useCallback(() => {
    Array.from(processor.model.surfacesMap.keys()).forEach(id => {
      processor.model.deleteSurface(id);
    });
  }, [processor]);

  return {
    processor,
    surfaces,
    processMessages,
    resetSurfaces,
  };
}

export function createSceneMessages(args: {
  surfaceId: string;
  components: Array<Record<string, unknown>>;
  value?: Record<string, unknown>;
  path?: string;
  theme?: Record<string, unknown>;
  sendDataModel?: boolean;
}): A2uiMessage[] {
  const {
    surfaceId,
    components,
    value,
    path = '/',
    theme,
    sendDataModel = true,
  } = args;

  const messages: A2uiMessage[] = [
    {
      version: 'v0.9',
      createSurface: {
        surfaceId,
        catalogId: basicCatalog.id,
        theme,
        sendDataModel,
      },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components,
      },
    },
  ];

  if (value !== undefined) {
    messages.push({
      version: 'v0.9',
      updateDataModel: {
        surfaceId,
        path,
        value,
      },
    });
  }

  return messages;
}
