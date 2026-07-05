/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

export function listVariables(): string {
  return `
def _list_variables():
    import json
    from types import BuiltinFunctionType, BuiltinMethodType, FunctionType, MethodType, MethodWrapperType, ModuleType, TracebackType

    _FORBIDDEN_TYPES = [type, BuiltinFunctionType, BuiltinMethodType, FunctionType, MethodType, MethodWrapperType, ModuleType, TracebackType]
    try:
        from IPython.core.autocall import ExitAutocall
        _FORBIDDEN_TYPES.append(ExitAutocall)
    except ImportError:
        pass
    _exclude = tuple(_FORBIDDEN_TYPES)

    _all = frozenset(globals())
    _vars = {}
    for _n in _all:
        _v = globals()[_n]
        
        if not (
            _n.startswith('_') or
            isinstance(_v, _exclude) or
            # Special IPython variables
            (_n == 'In' and isinstance(_v, list)) or
            (_n == 'Out' and isinstance(_v, dict))
        ):
            _vars[_n] = type(_v).__qualname__

    return json.dumps(_vars)

_list_variables()`;
}

export function saveVariables(variables: string[]): string {
  return `
def _pickle_variables():
    from base64 import encodebytes
    import json
    import pickle
    _names = {${variables.map(v => `"${v}"`).join(',')}}
    _data = {}
    for _n in _names:
        try:
            _v = globals()[_n]
            dump = pickle.dumps(_v)
            _data[_n] = encodebytes(dump).decode("ascii")
        except:
            ...

    return json.dumps(_data)

_pickle_variables()
`;
}

export function loadVariables(variables: string): string {
  return `
def _load_variables():
    from base64 import decodebytes
    import json
    import pickle
    _data = json.loads(${variables})
    _loaded = []
    for _n, _v in _data.items():
        try:
            dump = decodebytes(_v.encode("ascii"))
            globals()[_n] = pickle.loads(dump)
            _loaded.append(_n)
        except:
            ...
    return json.dumps(_loaded)

_load_variables()
`;
}

export function changeCurrentWorkingDirectory(path: string): string {
  const formattedPath = path
    .split('/')
    .map(seg => `"${seg}"`)
    .join(' / ');
  return `
def _change_current_directory():
    import os
    from pathlib import Path
    _local_content_mount_point = Path(Path.home() / ${formattedPath})
    _local_content_mount_point.mkdir(parents=True, exist_ok=True)
    os.chdir(_local_content_mount_point)

    assert Path.cwd() == _local_content_mount_point

_change_current_directory()
`;
}

export function getOutputCandidates(code: string): string[] {
  return Array.from(
    code.matchAll(
      /^((?<output>[A-z][\w]*)\s*=[^=]|\((?<walrus>[A-z][\w]*)\s*:=[^=)]+\))/gm,
    ),
  )
    .map(match => match.groups?.output ?? match.groups?.walrus ?? '')
    .filter(n => !!n);
}
