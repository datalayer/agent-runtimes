/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Code Sandbox Details…*, from the assistant's menu: where the agent's
 * code runs, and what is in it.
 *
 * A compact summary first — the kind and where, its URL (without its
 * tokens), the kernel (name, id, language, status), a cloud runtime's uid,
 * environment and time left, a local server's agent, Pyodide's version and
 * packages, when it started and was last active — each field shown only
 * when it is known. Then the kernel's variables: jupyter-react's
 * `KernelVariables`, with its renderers, ipywidgets drawn live where the
 * page talks to the kernel.
 *
 * How the variables are read, by what the page can reach:
 * - a kernel connection the host holds (the browser's Pyodide kernel):
 *   listed live, refreshed after each execution;
 * - a Jupyter server and the sandbox's kernel id (a local server, a cloud
 *   runtime): a connection to that kernel is opened here, and closed with
 *   the dialog;
 * - neither (an `eval` sandbox, a provider's, a server whose token the page
 *   does not hold): the agent-runtimes server runs the same snippet in the
 *   agent's sandbox (`POST /api/v1/sandbox/execute`), listed on demand.
 *
 * Loaded when it is first opened, never with the character.
 *
 * @module chat/assistant/SandboxDetailsDialog
 */

import type { JSX, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  Heading,
  IconButton,
  Label,
  Link,
  Text,
} from '@primer/react';
import { CheckIcon, CopyIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import {
  KernelAPI,
  KernelConnection,
  ServerConnection,
  type Kernel,
} from '@jupyterlab/services';
import {
  KernelVariables,
  executeSilently,
  type KernelVariablesExecutor,
} from '@datalayer/jupyter-react';
import {
  NO_SANDBOX_YET,
  SANDBOX_KIND_LABELS,
  displayUrl,
  sandboxIsLive,
  sandboxExecuteOverHttp,
  timeLeft,
  type AssistantSandbox,
} from './assistantDetails';

export type SandboxDetailsDialogProps = {
  sandbox: AssistantSandbox;
  /** The agent's name, for the title. */
  name: string;
  onClose: () => void;
};

/** A status, as a Primer label. */
function StatusLabel({ status }: { status: string }): JSX.Element {
  const variant =
    status === 'running' || status === 'idle'
      ? 'success'
      : status === 'busy' || status === 'starting'
        ? 'attention'
        : status === 'error' || status === 'dead'
          ? 'danger'
          : 'secondary';
  return (
    <Label variant={variant} size="small" data-sandbox-status={status}>
      {status}
    </Label>
  );
}

/** A URL, linked, with a copy button. */
function UrlValue({ url }: { url: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Link
        href={url}
        target="_blank"
        rel="noreferrer"
        sx={{ fontFamily: 'mono', fontSize: 0, wordBreak: 'break-all' }}
      >
        {url}
      </Link>
      <IconButton
        icon={copied ? CheckIcon : CopyIcon}
        aria-label="Copy the URL"
        size="small"
        variant="invisible"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      />
    </Box>
  );
}

/** A moment, for a reader. */
function moment(value: string | number | undefined): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  const at =
    typeof value === 'number'
      ? new Date(value < 1e12 ? value * 1000 : value)
      : new Date(value);
  return Number.isNaN(at.getTime()) ? undefined : at.toLocaleString();
}

/** What the kernel says of itself. */
type KernelFacts = {
  name?: string;
  id?: string;
  language?: string;
  status?: string;
  lastActivity?: string;
};

/** Pyodide's version and loaded packages, asked of the kernel. */
type PyodideFacts = { version?: string; python?: string; packages: string[] };

const PYODIDE_MARKER = '__DL_PYODIDE__';
const PYODIDE_SNIPPET = `def __dl_pyodide():
    import json, sys
    facts = {'python': sys.version.split()[0], 'packages': []}
    try:
        import pyodide
        facts['version'] = pyodide.__version__
    except Exception:
        pass
    try:
        import pyodide_js
        facts['packages'] = sorted(str(k) for k in pyodide_js.loadedPackages.object_keys())
    except Exception:
        pass
    print('${PYODIDE_MARKER}' + json.dumps(facts) + '${PYODIDE_MARKER}')
try:
    __dl_pyodide()
finally:
    del __dl_pyodide
`;

/** Pyodide's facts out of what the snippet printed. */
export function parsePyodideFacts(stdout: string): PyodideFacts | undefined {
  const end = stdout.lastIndexOf(PYODIDE_MARKER);
  const start = end > 0 ? stdout.lastIndexOf(PYODIDE_MARKER, end - 1) : -1;
  if (start < 0) {
    return undefined;
  }
  try {
    const facts = JSON.parse(
      stdout.slice(start + PYODIDE_MARKER.length, end),
    ) as Partial<PyodideFacts>;
    return {
      version: facts.version,
      python: facts.python,
      packages: Array.isArray(facts.packages) ? facts.packages : [],
    };
  } catch {
    return undefined;
  }
}

/** The kernel connection the dialog lists from: the host's, or one opened here. */
function useKernelConnection(
  sandbox: AssistantSandbox,
): Kernel.IKernelConnection | null {
  const [opened, setOpened] = useState<Kernel.IKernelConnection | null>(null);
  const { connection, url, token, kernelId, kind } = sandbox;
  const live = sandboxIsLive(sandbox);
  useEffect(() => {
    if (connection || !url || !kernelId || kind === 'browser' || !live) {
      return;
    }
    const base = url.replace(/\/+$/, '') + '/';
    const serverSettings = ServerConnection.makeSettings({
      baseUrl: base,
      wsUrl: base.replace(/^http/, 'ws'),
      token: token ?? '',
      appendToken: true,
    });
    const opening = new KernelConnection({
      model: { id: kernelId, name: '' },
      serverSettings,
      handleComms: true,
    });
    setOpened(opening);
    return () => {
      setOpened(null);
      opening.dispose();
    };
  }, [connection, url, token, kernelId, kind, live]);
  return live ? (connection ?? opened) : null;
}

export function SandboxDetailsDialog({
  sandbox,
  name,
  onClose,
}: SandboxDetailsDialogProps): JSX.Element {
  const connection = useKernelConnection(sandbox);
  const [kernel, setKernel] = useState<KernelFacts>({});
  const [pyodide, setPyodide] = useState<PyodideFacts>();
  const [showPackages, setShowPackages] = useState(false);

  // The kernel, as it says it is: its name, language, status, last activity.
  useEffect(() => {
    if (!connection) {
      setKernel({});
      return;
    }
    let cancelled = false;
    const update = (next: KernelFacts) =>
      !cancelled && setKernel(current => ({ ...current, ...next }));
    update({
      id: connection.id,
      name: connection.name || undefined,
      status: connection.status,
    });
    connection.info
      .then(info =>
        update({
          language: [info.language_info?.name, info.language_info?.version]
            .filter(Boolean)
            .join(' '),
        }),
      )
      .catch(() => undefined);
    if (sandbox.kind !== 'browser') {
      KernelAPI.getKernelModel(connection.id, connection.serverSettings)
        .then(model =>
          update({
            name: model?.name || undefined,
            lastActivity: model?.last_activity,
          }),
        )
        .catch(() => undefined);
    }
    const onStatus = (_: unknown, status: Kernel.Status) => update({ status });
    connection.statusChanged.connect(onStatus);
    return () => {
      cancelled = true;
      connection.statusChanged.disconnect(onStatus);
    };
  }, [connection, sandbox.kind]);

  // Pyodide's version and packages, asked once of the browser kernel.
  useEffect(() => {
    if (sandbox.kind !== 'browser' || !connection) {
      return;
    }
    let cancelled = false;
    executeSilently(connection, PYODIDE_SNIPPET)
      .then(({ stdout }) => {
        if (!cancelled) {
          setPyodide(parsePyodideFacts(stdout));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connection, sandbox.kind]);

  // Without a connection, the agent's server runs the snippet in its sandbox.
  const execute = useMemo<KernelVariablesExecutor | undefined>(
    () =>
      // Not before the sandbox is up: the server would start one to answer.
      !connection && sandbox.serverUrl && sandboxIsLive(sandbox)
        ? sandboxExecuteOverHttp(sandbox.serverUrl, sandbox.agentId)
        : undefined,
    [connection, sandbox.serverUrl, sandbox.agentId],
  );

  const url = displayUrl(sandbox.url ?? sandbox.serverUrl);
  const left = timeLeft(sandbox.expiresAt);
  const facts: [string, ReactNode][] = [];
  const add = (key: string, value: ReactNode | undefined | null) => {
    if (value !== undefined && value !== null && value !== '') {
      facts.push([key, value]);
    }
  };
  add('Environment', sandbox.environment);
  add('URL', url ? <UrlValue url={url} /> : undefined);
  add(
    'Kernel',
    kernel.name || kernel.id ? (
      <Text sx={{ fontFamily: 'mono', fontSize: 0 }}>
        {[kernel.name, kernel.id?.slice(0, 8)].filter(Boolean).join(' · ')}
      </Text>
    ) : undefined,
  );
  add('Language', kernel.language);
  add(
    'Kernel status',
    kernel.status ? <StatusLabel status={kernel.status} /> : undefined,
  );
  add(
    'Agent',
    sandbox.kind === 'local' || sandbox.kind === 'runtime'
      ? sandbox.agentId
      : undefined,
  );
  add('Runtime', sandbox.runtimeUid);
  add('Time left', left);
  add(
    'Burning rate',
    sandbox.burningRate !== undefined
      ? `${sandbox.burningRate} credits/h`
      : undefined,
  );
  add('Pyodide', pyodide?.version);
  add(
    'Packages',
    pyodide && pyodide.packages.length > 0 ? (
      <Box>
        <Button
          size="small"
          variant="invisible"
          onClick={() => setShowPackages(!showPackages)}
          aria-expanded={showPackages}
          sx={{ px: 1 }}
        >
          {`${pyodide.packages.length} loaded`}
        </Button>
        {showPackages && (
          <Text
            as="p"
            sx={{ m: 0, mt: 1, fontFamily: 'mono', fontSize: 0 }}
            data-sandbox-packages=""
          >
            {pyodide.packages.join(', ')}
          </Text>
        )}
      </Box>
    ) : undefined,
  );
  add('Started', moment(sandbox.startedAt));
  add('Last activity', moment(sandbox.lastActivity ?? kernel.lastActivity));

  return (
    <Dialog
      title={`${name} · Code Sandbox`}
      onClose={onClose}
      width="xlarge"
      height="large"
    >
      <Box
        data-assistant-sandbox-details=""
        sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
      >
        <Box
          data-sandbox-summary=""
          sx={{
            p: 3,
            bg: 'canvas.subtle',
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Text
              sx={{ fontWeight: 'semibold' }}
              data-sandbox-kind={sandbox.kind}
            >
              {SANDBOX_KIND_LABELS[sandbox.kind]}
              {sandbox.kind === 'runtime' && sandbox.variant
                ? ` (${sandbox.variant})`
                : ''}
            </Text>
            {sandbox.status && <StatusLabel status={sandbox.status} />}
          </Box>
          <Box
            as="dl"
            sx={{
              display: 'grid',
              gridTemplateColumns: 'max-content minmax(0, 1fr)',
              columnGap: 3,
              rowGap: 1,
              m: 0,
              fontSize: 1,
              alignItems: 'center',
            }}
          >
            {facts.map(([key, value]) => (
              <Box key={key} sx={{ display: 'contents' }}>
                <Box as="dt" sx={{ color: 'fg.muted' }}>
                  {key}
                </Box>
                <Box as="dd" sx={{ m: 0, minWidth: 0 }} data-sandbox-fact={key}>
                  {value}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
        <Box>
          <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
            Variables
          </Heading>
          {sandboxIsLive(sandbox) ? (
            <KernelVariables
              connection={connection}
              execute={execute}
              maxHeight="calc(80vh - 360px)"
            />
          ) : (
            <Text
              as="p"
              sx={{ color: 'fg.muted', fontSize: 1, m: 0 }}
              data-sandbox-not-running=""
            >
              {NO_SANDBOX_YET}
            </Text>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}

export default SandboxDetailsDialog;
