# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``ActorTemplate`` and ``EgressPolicy`` of an agent-runtimes actor.

Both are protojson-shaped ``ateapi`` messages, for ``kubectl ate create
actor-template -f -`` and ``kubectl ate create egress-policy <actor> -f -``
(Agent Substrate 1.0).

The template is immutable and its first actor is snapshotted ("golden"): every
actor of the template starts from that memory image. So:

- the image is pinned by digest (Agent Substrate refuses a tag anyway);
- the environment is literal and the same for every actor, so it carries no
  secret: a variable whose name says key, token, secret or password is refused.
  Credentials are put in the actor's outbound requests by the egress gateway
  (:func:`egress_policy`), and never enter the sandbox or its snapshots;
- what differs between actors comes from the ``systemInfo`` volume, mounted at
  ``/run/ate`` and read at each wake (:mod:`.identity`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional, Sequence

from .identity import ATESPACE_FILE, NAME_FILE, UID_FILE
from .settings import (
    DEFAULT_PORT,
    DEFAULT_SYSTEM_INFO_DIR,
    SPEC_VARIABLE,
    TARGET,
    WAKEUP_PATH,
)

#: Where the trust bundle volume is mounted, and the file in it.
TRUST_DIR = "/run/substrate/certs"
TRUST_FILE = "ca.pem"

#: The durable directory, saved with every snapshot.
DATA_DIR = "/data"

#: The trust bundles projected: the egress gateway's CA (HTTPS through the
#: gateway is re-originated by it) and the public roots.
TRUST_BUNDLES = ("egress-mitm.ate.dev", "system-roots.ate.dev")

#: A digest-pinned image reference.
_DIGEST = re.compile(r"^[^\s@]+@sha256:[0-9a-f]{64}$")

#: A DNS-1123 label: atespaces, template and container names.
_LABEL = re.compile(r"^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$")

#: Names that say the value is a credential.
_SECRET_NAME = re.compile(
    r"(API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)", re.IGNORECASE
)

#: The egress gateway's credential URIs.
_CREDENTIAL_URI = re.compile(
    r"^ate-secret://[a-z0-9]([-a-z0-9.]*[a-z0-9])?(/[^/?#%\s]+){2,}$"
)


@dataclass(frozen=True)
class TemplateRequest:
    """What an agent-runtimes actor template is made of.

    ``cpu_millicores`` and ``memory_bytes`` size every actor of the template
    (Agent Substrate's ``resources.limits``); ``worker_labels`` selects the
    ``WorkerPool``s it may run on (``workerSelector.matchLabels``).
    ``wakeup_timeout_seconds`` is how long Agent Substrate waits for the first
    wakeup probe to answer (its default, 30 s, was too short: on AWS t3 nodes
    under gVisor the golden actor failed at 30 s with 1 CPU, and passed in
    44 s with 2 CPUs and 180 s allowed, 13 November 2026).
    """

    atespace: str
    name: str
    image: str
    agent_spec_id: str = ""
    cpu_millicores: int = 2000
    memory_bytes: int = 2 * 1024**3
    wakeup_timeout_seconds: int = 180
    worker_labels: Mapping[str, str] = field(default_factory=dict)
    env: Mapping[str, str] = field(default_factory=dict)
    port: int = DEFAULT_PORT
    durable_data: bool = True
    trust_bundle: bool = True


def _refuse(request: TemplateRequest) -> None:
    for what, value in (
        ("atespace", request.atespace),
        ("template name", request.name),
    ):
        if not _LABEL.match(value or ""):
            raise ValueError(f"The {what} is a DNS-1123 label, not {value!r}.")
    if not _DIGEST.match(request.image or ""):
        raise ValueError(
            f"An ActorTemplate's image is pinned by digest (name@sha256:<64 hex>), not {request.image!r}."
        )
    if not 0 < request.port < 65536:
        raise ValueError(f"The port is from 1 to 65535, not {request.port}.")
    if request.wakeup_timeout_seconds <= 0:
        raise ValueError(f"The wakeup timeout is a number of seconds above zero, not {request.wakeup_timeout_seconds}.")
    if request.cpu_millicores <= 0 or request.memory_bytes <= 0:
        raise ValueError(
            "An actor is sized by both cpuMillicores and memoryBytes, above zero."
        )
    for name in request.env:
        if _SECRET_NAME.search(name):
            raise ValueError(
                f"{name} looks like a credential: a template's environment is the same in every "
                "actor and in every snapshot. Put the credential in the actor's EgressPolicy "
                "(replaceHeaders), and send a placeholder."
            )


def actor_template(request: TemplateRequest) -> dict[str, Any]:
    """The protojson ``ActorTemplate`` of an agent-runtimes actor.

    Parameters
    ----------
    request : TemplateRequest
        The atespace, name, image (by digest), agentspec, size, worker labels
        and literal environment.

    Returns
    -------
    dict
        The template, ready for ``kubectl ate create actor-template -f -``.

    Raises
    ------
    ValueError
        On a name that is not a DNS label, an image without a digest, a size
        not above zero, or a credential in the environment, in a sentence.
    """
    _refuse(request)
    env: dict[str, str] = {
        "AGENT_RUNTIMES_TARGET": TARGET,
        "ATE_PORT": str(request.port),
    }
    if request.agent_spec_id:
        env[SPEC_VARIABLE] = request.agent_spec_id
    env.update(request.env)
    mounts: list[dict[str, Any]] = [
        {"name": "system-info", "mountPath": DEFAULT_SYSTEM_INFO_DIR}
    ]
    volumes: list[dict[str, Any]] = [
        {
            "name": "system-info",
            "systemInfo": {
                "dataSources": [
                    {
                        "actorMetadata": {
                            "items": [
                                {
                                    "field": "ACTOR_METADATA_FIELD_NAME",
                                    "path": NAME_FILE,
                                },
                                {
                                    "field": "ACTOR_METADATA_FIELD_ATESPACE",
                                    "path": ATESPACE_FILE,
                                },
                                {"field": "ACTOR_METADATA_FIELD_UID", "path": UID_FILE},
                            ]
                        }
                    }
                ]
            },
        }
    ]
    if request.trust_bundle:
        mounts.append({"name": "trust", "mountPath": TRUST_DIR})
        volumes.append(
            {
                "name": "trust",
                "systemInfo": {
                    "dataSources": [
                        {
                            "trustBundle": {
                                "names": list(TRUST_BUNDLES),
                                "path": TRUST_FILE,
                            }
                        }
                    ]
                },
            }
        )
        env.setdefault("ATE_TRUST_BUNDLE", f"{TRUST_DIR}/{TRUST_FILE}")
    if request.durable_data:
        mounts.append({"name": "data", "mountPath": DATA_DIR})
        volumes.append({"name": "data", "durableDir": {}})
    template: dict[str, Any] = {
        "metadata": {"atespace": request.atespace, "name": request.name},
        "containers": [
            {
                "name": "agent-runtimes",
                "image": request.image,
                "command": ["agent-runtimes", "serve", "--target", TARGET],
                "env": [{"name": name, "value": value} for name, value in env.items()],
                "wakeupProbe": {
                    "httpGet": {"path": WAKEUP_PATH, "port": request.port},
                    "timeoutSeconds": request.wakeup_timeout_seconds,
                },
                "volumeMounts": mounts,
            }
        ],
        "volumes": volumes,
        "resources": {
            "limits": {
                "cpuMillicores": str(request.cpu_millicores),
                "memoryBytes": str(request.memory_bytes),
            }
        },
        "snapshotConfig": {"preferredFidelity": "SNAPSHOT_FIDELITY_MEMORY"},
    }
    if request.worker_labels:
        template["workerSelector"] = {"matchLabels": dict(request.worker_labels)}
    return template


@dataclass(frozen=True)
class EgressRule:
    """One HTTPS destination of an actor, with the credential put in its requests.

    ``credential_uri`` (``ate-secret://<provider>/<path>``) names what the egress
    gateway puts in ``header`` (after ``prefix``); without it the destination
    is reachable and nothing is injected.
    """

    hostnames: Sequence[str]
    credential_uri: str = ""
    header: str = "Authorization"
    prefix: str = "Bearer "


def egress_policy(rules: Sequence[EgressRule]) -> dict[str, Any]:
    """The protojson ``EgressPolicy`` rules of an agent-runtimes actor.

    Raises
    ------
    ValueError
        Without a rule, on a rule without a hostname, or on a credential URI
        that is not ``ate-secret://<provider>/<path>``, in a sentence.
    """
    if not rules:
        raise ValueError("An EgressPolicy has at least one rule.")
    rendered: list[dict[str, Any]] = []
    for rule in rules:
        hostnames = [h.strip() for h in rule.hostnames if h.strip()]
        if not hostnames:
            raise ValueError("An egress rule names at least one hostname.")
        https: dict[str, Any] = {"hostnames": hostnames}
        if rule.credential_uri:
            if not _CREDENTIAL_URI.match(rule.credential_uri):
                raise ValueError(
                    "A credential is named ate-secret://<provider>/<path> (two segments at "
                    f"least), not {rule.credential_uri!r}."
                )
            https["effects"] = {
                "replaceHeaders": [
                    {
                        "header": rule.header,
                        "prefix": rule.prefix,
                        "credentialUri": rule.credential_uri,
                    }
                ]
            }
        rendered.append({"https": https})
    return {"rules": rendered}


def parse_pairs(pairs: Optional[Sequence[str]], what: str) -> dict[str, str]:
    """``NAME=value`` pairs as a mapping, refused in a sentence when malformed."""
    parsed: dict[str, str] = {}
    for pair in pairs or ():
        name, sep, value = pair.partition("=")
        if not sep or not name.strip():
            raise ValueError(f"A {what} is NAME=value, not {pair!r}.")
        parsed[name.strip()] = value
    return parsed


__all__ = [
    "DATA_DIR",
    "EgressRule",
    "TRUST_BUNDLES",
    "TRUST_DIR",
    "TRUST_FILE",
    "TemplateRequest",
    "actor_template",
    "egress_policy",
    "parse_pairs",
]
