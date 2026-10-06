# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Small conveniences for an application's code (LOOP P-15).

`run_sync` runs blocking code without stopping the session's other work;
`cache` keeps what a function answered, for every session of this process.
Handlers are sync or async alike already (`session.call`).
"""

from __future__ import annotations

import asyncio
import functools
import inspect
from typing import Any, Callable, Dict, Hashable, Mapping, Tuple, TypeVar

T = TypeVar("T")


async def run_sync(function: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run blocking code in a thread, and wait for it without blocking the session.

    ``rows = await run_sync(pandas.read_csv, path)``.

    Parameters
    ----------
    function : callable
        A plain, blocking function.
    *args, **kwargs : Any
        What it is given.

    Returns
    -------
    Any
        What it returned; what it raised is raised.
    """
    if inspect.iscoroutinefunction(function):
        raise TypeError(
            f"{function.__name__} is async: await it, run_sync is for blocking code."
        )
    return await asyncio.to_thread(function, *args, **kwargs)


def _key(args: Tuple[Any, ...], kwargs: Mapping[str, Any]) -> Hashable:
    key = (args, tuple(sorted(kwargs.items())))
    try:
        hash(key)
    except TypeError:
        raise TypeError(
            "A cached function is called with values that can be told apart only "
            "when they are hashable: strings, numbers, tuples."
        ) from None
    return key


def cache(function: Callable[..., Any]) -> Callable[..., Any]:
    """Keep what a function answers for its arguments, for as long as the process runs.

    Sync or async: an async function called again while the first call runs
    waits for that call rather than running twice. What it raised is not
    kept. ``cached.cache_clear()`` forgets everything.

    Parameters
    ----------
    function : callable
        The function; its arguments hashable.

    Returns
    -------
    callable
        The function, its answers kept.
    """
    if inspect.iscoroutinefunction(function):
        running: Dict[Hashable, asyncio.Future[Any]] = {}

        @functools.wraps(function)
        async def cached_async(*args: Any, **kwargs: Any) -> Any:
            key = _key(args, kwargs)
            future = running.get(key)
            if future is None:
                future = asyncio.ensure_future(function(*args, **kwargs))
                running[key] = future
            try:
                return await asyncio.shield(future)
            except BaseException:
                if future.done() and running.get(key) is future:
                    del running[key]
                raise

        cached_async.cache_clear = running.clear
        return cached_async

    kept: Dict[Hashable, Any] = {}

    @functools.wraps(function)
    def cached(*args: Any, **kwargs: Any) -> Any:
        key = _key(args, kwargs)
        if key not in kept:
            kept[key] = function(*args, **kwargs)
        return kept[key]

    cached.cache_clear = kept.clear
    return cached


__all__ = ["cache", "run_sync"]
