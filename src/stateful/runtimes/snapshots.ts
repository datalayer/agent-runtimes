/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { KernelExecutor } from '@datalayer/jupyter-react';
import { Kernel } from '@jupyterlab/services';
import { createSandboxSnapshotDownloadURL, uploadCodeSandboxSnapshot } from '.';

type Props = {
  connection: Kernel.IKernelConnection;
  metadata: {
    filename: string;
    [key: string]: string;
  };
  onUploadProgress?: (bytesUploaded: number, bytesTotal: number) => void;
};

/**
 * Snapshot a runtime through the frontend and upload it to the cloud.
 *
 * Note: You should use this only for browser runtimes.
 */
export async function createSandboxSnapshot(props: Props): Promise<void> {
  const { connection, metadata, onUploadProgress } = props;
  const dump = await new KernelExecutor({ connection }).execute(
    GET_RUNTIME_SNAPSHOT_SNIPPET,
    {
      storeHistory: false,
    },
  );
  const serializedData = (dump.get(0)?.data['application/vnd.jupyter.stdout'] ??
    '') as string;
  // Convert the data to blob.
  const bytes = base64ToBytes(serializedData);
  const file = new Blob([bytes.buffer]);
  return uploadCodeSandboxSnapshot({
    file,
    metadata,
    onProgress: onUploadProgress,
  });
}

function base64ToBytes(base64: string) {
  // Taken from https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa#unicode_strings
  const binString = atob(base64);
  // @ts-expect-error TypeScript does not like this
  return Uint8Array.from(binString, m => m.codePointAt(0));
}

/**
 * Load a snapshot within a browser kernel.
 *
 * Note: You should use this only for browser kernels.
 */
export async function loadBrowserSandboxSnapshot({
  connection,
  id,
}: {
  connection: Kernel.IKernelConnection;
  id: string;
}): Promise<void> {
  const downloadURL = createSandboxSnapshotDownloadURL(id);
  const response = await fetch(downloadURL);
  const buffer = await response.arrayBuffer();
  const base64 = bytesToBase64(new Uint8Array(buffer));
  await new KernelExecutor({
    connection,
  }).execute(getLoadSandboxSnapshotSnippet(base64), {
    storeHistory: false,
    silent: true,
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  // Taken from https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa#unicode_strings
  const binString = Array.from(bytes, byte => String.fromCodePoint(byte)).join(
    '',
  );
  return btoa(binString);
}

const GET_RUNTIME_SNAPSHOT_SNIPPET = `def _create_snapshot():
    import logging
    import os
    import pickle
    from base64 import encodebytes
    from tempfile import TemporaryFile
    from types import BuiltinFunctionType, BuiltinMethodType, FunctionType, MethodType, MethodWrapperType, ModuleType, TracebackType
    
    # print(pickle.DEFAULT_PROTOCOL)

    class NotFound:
        pass

    missing = NotFound()

    FORBIDDEN_TYPES = [type, BuiltinFunctionType, BuiltinMethodType, FunctionType, MethodType, MethodWrapperType, ModuleType, TracebackType, NotFound]
    try:
        from IPython.core.autocall import ExitAutocall
        from IPython.core.interactiveshell import InteractiveShell
        FORBIDDEN_TYPES.extend([ExitAutocall, InteractiveShell])
    except ImportError:
        pass
    exclude = tuple(FORBIDDEN_TYPES)

    all = frozenset(filter(lambda n: not n.startswith("_"), globals()))

    line_separator = bytes(os.linesep, "utf-8")
    with TemporaryFile() as dump:
        for _n in all:
            _v = globals().get(_n, missing)
            
            if not (
                isinstance(_v, exclude) or
                # Special IPython variables
                (_n == "In" and isinstance(_v, list)) or
                (_n == "Out" and isinstance(_v, dict))
            ):
                try:
                    dumped_n = _n.encode("utf-8") + line_separator + pickle.dumps(_v) + line_separator + b"\\x00" + line_separator
                    dump.write(dumped_n)
                except BaseException as e:
                    logging.warning("Failed to dump variable [%s ([%s])].", _n, type(_v).__qualname__, exc_info=e)
                else:
                    logging.debug("Variable [%s] dumped", _n)

        dump.seek(0)
        print(encodebytes(dump.read()).decode("ascii"))

_create_snapshot()
del _create_snapshot
`;

function getLoadSandboxSnapshotSnippet(content: string) {
  return `async def _load_snapshot():
    import os
    import logging
    import platform
    import pickle
    from base64 import decodebytes
    is_pyodide = platform.node() == "emscripten"

    snapshot = decodebytes("${content}".encode("ascii"))
    line_sep = bytes(os.linesep, "utf-8")
    variable_separator = b"\\x00" + line_sep
    name = b""
    value = b""
    for line in snapshot.splitlines():
        line += line_sep
        if line == variable_separator:
            name_s = name.strip().decode("utf-8")
            try:
                try:
                    globals()[name_s] = pickle.loads(value)
                except ModuleNotFoundError as m:
                    if is_pyodide:
                        import micropip
                        logging.info(f'Installing %s...', m.name)
                        await micropip.install(m.name)
                        globals()[name_s] = pickle.loads(value)
                    else:
                        raise m
            except BaseException as e:
                logging.warning("Failed to load variable [%s].", name_s, exc_info=e)
            else:
                logging.debug("Variable [%s] loaded", name_s)

            name = b""
            value = b""
        else:
            if not name:
                name = line
            else:
                value += line
await _load_snapshot()
del _load_snapshot`;
}
