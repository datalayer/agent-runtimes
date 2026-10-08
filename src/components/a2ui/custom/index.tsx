/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Components an application's developer wrote, drawn (LOOP P-17): an A2UI
 * component of that application only, made as Datalayer's own are — its
 * schema from its declaration (`componentSchemaOf`), its view by A2UI's own
 * factory — so that it binds and acts as a Table does, and drawn in a
 * sandboxed frame of no origin (`./sandbox`): its properties and what it
 * shows go in, what it sends comes out, written where its binding points and
 * then its action dispatched.
 *
 * Never global: `customImplementations(app)` is handed to the catalog of
 * that application's page (`catalogOfBlocks`), and to no other.
 *
 * @module components/a2ui/custom
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createComponentImplementation,
  type ReactA2uiComponentProps,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9';
import type { ComponentApi } from '@a2ui/web_core/v0_9';
import type {
  AppCustomComponentSpec,
  AppSpec,
} from '../../../types/agentspecs';
import { customComponentEntry } from '../../../apps/apps/customComponents';
import { componentSchemaOf } from '../datalayer/schema';
import { BlockFrame, Problem } from '../datalayer/parts';
import {
  CUSTOM_FRAME_SANDBOX,
  FRAME_TAG,
  customFrameDocument,
  customModule,
  frameNonce,
  fromFrame,
  type ToFrame,
} from './sandbox';

type CustomProps = Record<string, unknown> & {
  action?: () => void;
  weight?: number;
};

/** What the frame is given: its declared properties and what it shows, nothing else. */
export function givenToFrame(
  component: AppCustomComponentSpec,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const declared = Object.keys(
    (component.props.properties ?? {}) as Record<string, unknown>,
  );
  const names = new Set([...declared, ...component.shows, ...component.sends]);
  return Object.fromEntries(
    Object.entries(props).filter(
      ([name, value]) => names.has(name) && typeof value !== 'function',
    ),
  );
}

/** The setter A2UI gives a binding: `setValue` for `value`. */
const setterOf = (name: string): string =>
  `set${name.charAt(0).toUpperCase()}${name.slice(1)}`;

/** A component its developer wrote, in its frame. */
export function CustomComponentView({
  component,
  props,
  fetcher,
}: {
  component: AppCustomComponentSpec;
  props: CustomProps;
  /** How its module is fetched; the page's `fetch` unless given (tests). */
  fetcher?: typeof fetch;
}): JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const srcDoc = useMemo(
    () => customFrameDocument(frameNonce(), component.name),
    [component.name],
  );
  // What it is given, told again only when a value of it changes.
  const givenKey = JSON.stringify(givenToFrame(component, props));
  const given = useMemo(
    () => JSON.parse(givenKey) as Record<string, unknown>,
    [givenKey],
  );
  const propsRef = useRef(props);
  propsRef.current = props;

  const tell = (message: ToFrame) =>
    frame.current?.contentWindow?.postMessage(message, '*');

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      const said = fromFrame(event, frame.current?.contentWindow);
      if (!said) {
        return;
      }
      if (said.kind === 'ready') {
        customModule(component.source, component.integrity, fetcher)
          .then(code => {
            tell({
              tag: FRAME_TAG,
              kind: 'props',
              props: givenToFrame(component, propsRef.current),
            });
            tell({ tag: FRAME_TAG, kind: 'module', code });
            setReady(true);
          })
          .catch((error: unknown) =>
            setProblem(error instanceof Error ? error.message : String(error)),
          );
      } else if (said.kind === 'failed') {
        setProblem(`It could not be drawn: ${said.message}.`);
      } else if (said.kind === 'send') {
        // What it sends is what it declares, and nothing else.
        if (!component.sends.includes(said.name)) {
          setProblem(
            `It sent “${said.name}”, which it does not declare under \`sends\`.`,
          );
          return;
        }
        const set = propsRef.current[setterOf(said.name)];
        if (typeof set === 'function') {
          (set as (value: unknown) => void)(said.value);
        }
        propsRef.current.action?.();
      }
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [component, fetcher]);

  useEffect(() => {
    if (ready) {
      tell({ tag: FRAME_TAG, kind: 'props', props: given });
    }
  }, [ready, given]);

  return (
    <BlockFrame
      label={component.description || component.name}
      weight={props.weight}
      testId={`custom-${component.name}`}
    >
      {problem ? <Problem>{problem}</Problem> : null}
      <iframe
        ref={frame}
        title={component.description || component.name}
        sandbox={CUSTOM_FRAME_SANDBOX}
        srcDoc={srcDoc}
        referrerPolicy="no-referrer"
        style={{
          width: '100%',
          height: `${component.height}px`,
          border: 0,
          display: 'block',
        }}
      />
    </BlockFrame>
  );
}

/**
 * A component its developer wrote as A2UI's renderer registers one: its
 * schema from its declaration, its view by A2UI's own factory, drawn in its
 * frame.
 */
export function customImplementation(
  component: AppCustomComponentSpec,
  version = '0.0.0',
  fetcher?: typeof fetch,
): ReactComponentImplementation {
  const entry = customComponentEntry(component, version);
  const api = { name: component.name, schema: componentSchemaOf(entry) };
  const Render = ({ props }: ReactA2uiComponentProps<CustomProps>) => (
    <CustomComponentView
      component={component}
      props={props}
      fetcher={fetcher}
    />
  );
  return createComponentImplementation(
    api as unknown as ComponentApi,
    Render as unknown as Parameters<typeof createComponentImplementation>[1],
  );
}

/** The renderers of the components an application's developer wrote, for its page alone. */
export function customImplementations(
  app: Pick<AppSpec, 'interface' | 'version'>,
  fetcher?: typeof fetch,
): ReactComponentImplementation[] {
  return (app.interface.customComponents ?? []).map(component =>
    customImplementation(component, app.version, fetcher),
  );
}

export {
  CUSTOM_FRAME_SANDBOX,
  customFrameDocument,
  customFramePolicy,
  customModule,
  fromFrame,
  integrityHolds,
} from './sandbox';
