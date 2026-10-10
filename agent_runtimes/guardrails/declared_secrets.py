# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Only the secrets its specs declare reach a runtime (LOOP R-19, decided 2026-10-07).

A runtime is no longer given the account's whole set of secrets. What it is
given is what the specs it is configured from **declare**, read off them:

- each MCP server it reaches — the agent's ``mcp_servers`` and an
  application's ``connections`` — its ``envvars`` and every ``${VAR}`` its
  command line, its environment or its address names;
- each skill its agent runs — the skill's ``envvars``;
- a subagent the agent *is* by reference (``ref``), the same, read off that
  agentspec;
- a deployment that takes a signed user (D-21) — its user secret,
  ``DATALAYER_APP_USER_SECRET_<UID>``;
- what the code an MCP server's tools write reads in the code sandbox — its
  ``sandbox_envvars`` (Earthdata's download script: ``EARTHDATA_USERNAME``,
  ``EARTHDATA_PASSWORD``) — given to the sandbox when the account has them,
  never to the server, never required;
- the application the runtime was **launched for** (:func:`note_launched`):
  the Operator passes its Appspec at launch, so its connections' secrets are
  declared before its agent is made;
- and :data:`PLATFORM_RUNTIME_SECRETS`, the runtime's own, which is empty:
  the runtime calls its models with its ai-inference token and acts with the
  person's token, each given in a field of its own, never from the secrets.
  ``DATALAYER_API_KEY`` is given only when a server or a skill declares it.

Where each goes: the runtime's process holds them all, an MCP server is
started with its own and no other's (:func:`env_for_server`), and the code
sandbox — where the code the model writes runs — gets the skills' alone
(:attr:`DeclaredSecrets.kernel`): a server's credential stays with the server.

A spec whose server or skill needs a secret that is not there is refused, in
a sentence (:meth:`DeclaredSecrets.missing`): no fallback to all the secrets.

Pure but for the catalogues it reads; :func:`declared_secrets` is what the
companion asks (``POST /agents/declared-secrets``) before it gives a runtime
anything, and what ``configure-from-spec`` keeps to when it receives them.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass, field
from typing import (
    Any,
    Callable,
    Dict,
    FrozenSet,
    Iterable,
    List,
    Mapping,
    Optional,
    Set,
)

#: The secrets the runtime itself needs from the account, whatever its specs
#: say. None: its model token and the person's token come in fields of their
#: own (``user_token``, the ai-inference token), the sandbox's in its URL.
PLATFORM_RUNTIME_SECRETS: FrozenSet[str] = frozenset()

#: A placeholder a server's command line, environment or address names.
_PLACEHOLDER = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


def env_name(ref: Any) -> str:
    """A variable's name from an agentspecs reference: ``GITHUB_TOKEN:0.0.1`` → ``GITHUB_TOKEN``."""
    return str(ref or "").strip().split(":", 1)[0].strip()


def _ref_id(ref: Any) -> str:
    """An id without its version: ``earthdata:0.0.1`` → ``earthdata``."""
    text = str(ref or "").strip()
    base, _, version = text.rpartition(":")
    return base if base and "." in version else text


def _get(item: Any, *keys: str) -> Any:
    """A field of a model or a dict, by the first of its names that is set."""
    for key in keys:
        value = item.get(key) if isinstance(item, Mapping) else getattr(item, key, None)
        if value is not None:
            return value
    return None


def server_env_names(server: Any) -> FrozenSet[str]:
    """What an MCP server needs: its ``envvars`` and the ``${VAR}`` it names."""
    names: Set[str] = set()
    for ref in _get(server, "required_env_vars", "requiredEnvVars", "envvars") or []:
        name = env_name(ref)
        if name:
            names.add(name)
    texts: List[str] = [str(_get(server, "url") or "")]
    texts += [str(arg) for arg in _get(server, "args") or []]
    env = _get(server, "env") or {}
    if isinstance(env, Mapping):
        texts += [str(value) for value in env.values()]
    for text in texts:
        names.update(_PLACEHOLDER.findall(text))
    return frozenset(names)


def sandbox_env_names(server: Any) -> FrozenSet[str]:
    """What the code an MCP server's tools write reads in the sandbox: its ``sandbox_envvars``."""
    return frozenset(
        name
        for name in (
            env_name(ref)
            for ref in _get(
                server, "sandbox_env_vars", "sandboxEnvVars", "sandbox_envvars"
            )
            or []
        )
        if name
    )


def _catalog_server(server_id: str) -> Any:
    from agent_runtimes.mcp.catalog_mcp_servers import get_catalog_server

    return get_catalog_server(server_id)


def _skill_env_names(skill_ref: Any) -> FrozenSet[str]:
    from agent_runtimes.specs.skills import get_skill_spec

    ref = _get(skill_ref, "id", "name") if not isinstance(skill_ref, str) else skill_ref
    spec = get_skill_spec(str(ref or ""))
    if spec is None:
        return frozenset()
    return frozenset(name for name in (env_name(ref) for ref in spec.envvars) if name)


@dataclass(frozen=True)
class DeclaredSecrets:
    """The secrets a runtime's specs declare, by who uses them."""

    #: Who needs which: ``the MCP server earthdata`` → ``{DATALAYER_API_KEY}``.
    #: Each is required: a spec whose consumer lacks one is refused.
    consumers: Dict[str, FrozenSet[str]] = field(default_factory=dict)
    #: By MCP server id: what that server is started with, and nothing else.
    servers: Dict[str, FrozenSet[str]] = field(default_factory=dict)
    #: What the code sandbox gets: the skills' (their scripts run there).
    kernel: FrozenSet[str] = frozenset()
    #: Held by the process for its own checks, never required up front, never
    #: in the sandbox: a deployment's user secret (D-21, refused per session).
    held: FrozenSet[str] = frozenset()
    #: Given when the account has them, never required: what an MCP server's
    #: scripts read in the sandbox (``sandbox_envvars``), also in ``kernel``.
    offered: FrozenSet[str] = frozenset()

    @property
    def runtime(self) -> FrozenSet[str]:
        """Every name the runtime's process may be given."""
        names: Set[str] = (
            set(PLATFORM_RUNTIME_SECRETS) | set(self.held) | set(self.offered)
        )
        for needed in self.consumers.values():
            names |= needed
        return frozenset(names)

    def merged(self, other: Optional["DeclaredSecrets"]) -> "DeclaredSecrets":
        """These and ``other``'s: both sets of specs, declared together."""
        if other is None:
            return self
        consumers = {key: frozenset(value) for key, value in self.consumers.items()}
        for key, value in other.consumers.items():
            consumers[key] = consumers.get(key, frozenset()) | value
        servers = dict(self.servers)
        for key, value in other.servers.items():
            servers[key] = servers.get(key, frozenset()) | value
        return DeclaredSecrets(
            consumers=consumers,
            servers=servers,
            kernel=self.kernel | other.kernel,
            held=self.held | other.held,
            offered=self.offered | other.offered,
        )

    def missing(self, available: Callable[[str], bool], who: str) -> List[str]:
        """Why ``who`` cannot be set up, a sentence per secret that is not there."""
        sentences: List[str] = []
        for consumer, needed in sorted(self.consumers.items()):
            for name in sorted(needed):
                if not available(name):
                    sentences.append(
                        f"{who} is not set up: {consumer} needs {name}, which this "
                        "runtime was not given: add it to the account's secrets "
                        "(or set it before a local run), then configure it again."
                    )
        return sentences

    def as_names(self) -> Dict[str, Any]:
        """What the companion is answered: names only, never a value."""
        return {
            "runtime": sorted(self.runtime),
            "kernel": sorted(self.kernel),
            "consumers": {
                key: sorted(value) for key, value in sorted(self.consumers.items())
            },
        }


def declared_secrets(
    agent_spec: Any = None,
    *,
    forwarded_spec: Optional[Mapping[str, Any]] = None,
    app_spec: Any = None,
    app_instance: Optional[Mapping[str, Any]] = None,
    mcp_servers: Iterable[Any] = (),
    skills: Iterable[Any] = (),
    resolve_agent: Optional[Callable[[str], Any]] = None,
) -> DeclaredSecrets:
    """The secrets the specs a runtime is configured from declare.

    ``agent_spec`` is the library's (an ``Agentspec``, a Cog's spec, or a
    stored creation record); ``forwarded_spec`` the one the platform sent as
    it is; ``app_spec`` an Appspec (a model or its file's dict) and
    ``app_instance`` where it runs (its ``deployment_uid``). ``mcp_servers``
    and ``skills`` add what a creation request selected beside its spec.
    ``resolve_agent`` finds an agentspec by id for a subagent's ``ref``.
    """
    consumers: Dict[str, Set[str]] = {}
    servers: Dict[str, FrozenSet[str]] = {}
    kernel: Set[str] = set()
    held: Set[str] = set()
    offered: Set[str] = set()
    seen_agents: Set[str] = set()

    def add_server(server: Any) -> None:
        if isinstance(server, str) or (
            isinstance(server, Mapping)
            and set(server) <= {"id", "origin", "session_uid"}
        ):
            server_id = _ref_id(server if isinstance(server, str) else server.get("id"))
            if not server_id or server_id in servers:
                return
            resolved = _catalog_server(server_id)
            if resolved is None:
                # Not in the catalogue: an mcp.json server, read where it is kept.
                try:
                    from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

                    resolved = get_mcp_lifecycle_manager().get_server_config_from_file(
                        server_id
                    )
                except Exception:  # noqa: BLE001 - none to read
                    resolved = None
            if resolved is None:
                return
            server = resolved
        else:
            server_id = _ref_id(_get(server, "id"))
            if not server_id:
                return
            if _get(server, "enabled") is False:
                return
        names = server_env_names(server)
        servers[server_id] = servers.get(server_id, frozenset()) | names
        if names:
            consumers.setdefault(f"the MCP server {server_id}", set()).update(names)
        sandbox = sandbox_env_names(server)
        kernel.update(sandbox)
        offered.update(sandbox)

    def add_skill(skill: Any) -> None:
        names = _skill_env_names(skill)
        if names:
            label = _ref_id(
                skill if isinstance(skill, str) else _get(skill, "id", "name")
            )
            consumers.setdefault(f"the skill {label}", set()).update(names)
            kernel.update(names)

    def add_agent(spec: Any, *, again: bool = False) -> None:
        if spec is None:
            return
        identity = str(_get(spec, "id", "agent_spec_id") or "")
        if identity and not again:
            if identity in seen_agents:
                return
            seen_agents.add(identity)
        for server in _get(spec, "mcp_servers", "mcpServers") or []:
            add_server(server)
        for server in _get(spec, "selected_mcp_servers") or []:
            if _get(server, "origin") == "contents":
                continue  # Reached through a Contents session: no credential here.
            add_server(
                server if isinstance(server, str) else str(_get(server, "id") or "")
            )
        for skill in _get(spec, "skills") or []:
            add_skill(skill)
        subagents = _get(spec, "subagents")
        for sub in (_get(subagents, "subagents") or []) if subagents else []:
            if _get(sub, "a2a"):
                continue  # Another runtime, given its own.
            ref = _get(sub, "ref")
            if ref and resolve_agent is not None:
                add_agent(resolve_agent(_ref_id(ref)))

    add_agent(agent_spec)
    if forwarded_spec:
        # The platform's copy, read as well: a field it adds is declared too.
        add_agent(forwarded_spec, again=True)
    for server in mcp_servers:
        add_server(server)
    for skill in skills:
        add_skill(skill)

    if app_spec is not None:
        app = (
            app_spec.model_dump(by_alias=True)
            if hasattr(app_spec, "model_dump")
            else app_spec
        )
        for connection in _get(app, "connections") or []:
            add_server(_ref_id(_get(connection, "server")))
        deployment = _get(app, "deployment") or {}
        embedded = _get(deployment, "embedded") or {}
        host = _get(embedded, "host") or {}
        # The Appspec says it as `host.user: signed` (D-21); a `signed_user`
        # key no Appspec has was read here, so a kept runtime was never given
        # its deployment's secret and refused every signed user (2026-10-10).
        signed = _get(host, "user") == "signed"
        deployment_uid = str((app_instance or {}).get("deployment_uid") or "")
        if signed and deployment_uid:
            from agent_runtimes.loop.apps.host_user import secret_variable

            held.add(secret_variable(deployment_uid))

    return DeclaredSecrets(
        consumers={key: frozenset(value) for key, value in consumers.items()},
        servers=servers,
        kernel=frozenset(kernel),
        held=frozenset(held),
        offered=frozenset(offered),
    )


# --- what a configure gave this process ------------------------------------------

_LOCK = threading.Lock()
#: The names a configure set in this process's environment: an MCP server is
#: started without those it does not declare, and a later configure that no
#: longer declares one takes it back.
_GIVEN: Set[str] = set()


#: What the application the runtime was launched for declares: the Operator
#: passes its Appspec at launch, and the companion hands it on; every later
#: configure declares it too, so its agent finds its connections' secrets.
_LAUNCHED: List[Optional[DeclaredSecrets]] = [None]


def note_launched(declared: Optional[DeclaredSecrets]) -> None:
    """Remember what the application the runtime was launched for declares."""
    with _LOCK:
        _LAUNCHED[0] = declared


def launched() -> Optional[DeclaredSecrets]:
    """What the application the runtime was launched for declares, or None."""
    with _LOCK:
        return _LAUNCHED[0]


def given_names() -> FrozenSet[str]:
    """The names configures set in this process."""
    with _LOCK:
        return frozenset(_GIVEN)


def note_given(names: Iterable[str]) -> None:
    """Remember the names a configure set in this process."""
    with _LOCK:
        _GIVEN.update(names)


def forget_given(names: Iterable[str]) -> None:
    """Forget names a configure took back."""
    with _LOCK:
        _GIVEN.difference_update(names)


def keep_declared(
    given: Mapping[str, str], declared: FrozenSet[str]
) -> tuple[Dict[str, str], List[str]]:
    """What of ``given`` is declared, kept; and the names dropped, sorted."""
    kept = {name: value for name, value in given.items() if name in declared}
    return kept, sorted(name for name in given if name not in declared)


def env_for_server(env: Mapping[str, str], server: Any) -> Dict[str, str]:
    """A server's environment: without the secrets a configure gave for others."""
    own = server_env_names(server)
    others = given_names() - own
    return {name: value for name, value in env.items() if name not in others}


__all__ = [
    "PLATFORM_RUNTIME_SECRETS",
    "DeclaredSecrets",
    "declared_secrets",
    "env_for_server",
    "env_name",
    "forget_given",
    "given_names",
    "keep_declared",
    "launched",
    "note_given",
    "note_launched",
    "sandbox_env_names",
    "server_env_names",
]
