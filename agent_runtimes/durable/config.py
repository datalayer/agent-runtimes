# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Configuration for DBOS durable execution.

Provides configuration for the DBOS database backend used for
workflow persistence and recovery. Supports both SQLite (single-pod,
default) and PostgreSQL (multi-pod, production).
"""

import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Default SQLite path inside the agent pod volume
_DEFAULT_SQLITE_PATH = "/tmp/dbos/agent_durable.db"


@dataclass
class DurableConfig:
    """Configuration for DBOS durable execution.

    Attributes
    ----------
    enabled : bool
        Whether durable execution is enabled (default: False).
    database_url : str | None
        Full database URL for Postgres (e.g. ``postgresql://user:pass@host/db``).
        When set, takes precedence over ``sqlite_path``.
    sqlite_path : str
        Path to the SQLite database file (used when ``database_url`` is None).
    recovery_on_startup : bool
        Whether to recover pending workflows on DBOS launch.
    """

    enabled: bool = False
    database_url: str | None = None
    sqlite_path: str = _DEFAULT_SQLITE_PATH
    recovery_on_startup: bool = True

    @classmethod
    def from_env(cls) -> "DurableConfig":
        """Build configuration from environment variables.

        Environment variables:
            AGENT_DURABLE_ENABLED — ``true`` to enable durable execution.
            DBOS_DATABASE_URL — Full Postgres URL (overrides SQLite).
            DBOS_SQLITE_PATH — Path to SQLite file.
            DBOS_RECOVERY_ON_STARTUP — ``false`` to disable recovery.
        """
        enabled = os.environ.get("AGENT_DURABLE_ENABLED", "").lower() == "true"
        database_url = os.environ.get("DBOS_DATABASE_URL")
        sqlite_path = os.environ.get("DBOS_SQLITE_PATH", _DEFAULT_SQLITE_PATH)
        recovery_on_startup = (
            os.environ.get("DBOS_RECOVERY_ON_STARTUP", "true").lower() != "false"
        )
        config = cls(
            enabled=enabled,
            database_url=database_url,
            sqlite_path=sqlite_path,
            recovery_on_startup=recovery_on_startup,
        )
        if enabled:
            logger.info(
                "Durable execution enabled — backend: %s",
                "postgres" if database_url else f"sqlite ({sqlite_path})",
            )
        return config

    @classmethod
    def from_agent_spec(
        cls, spec_advanced: dict | None, fallback: "DurableConfig | None" = None
    ) -> "DurableConfig":
        """Build configuration from an AgentSpec's ``advanced`` field.

        Parameters
        ----------
        spec_advanced : dict | None
            The ``advanced`` dict from an ``AgentSpec``.
        fallback : DurableConfig | None
            Fallback configuration (typically from env vars).
        """
        base = fallback or cls.from_env()
        if not spec_advanced:
            return base
        durable_cfg = spec_advanced.get("durable", {})
        if not durable_cfg:
            return base
        return cls(
            enabled=durable_cfg.get("enabled", base.enabled),
            database_url=durable_cfg.get("database_url", base.database_url),
            sqlite_path=durable_cfg.get("sqlite_path", base.sqlite_path),
            recovery_on_startup=durable_cfg.get(
                "recovery_on_startup", base.recovery_on_startup
            ),
        )
