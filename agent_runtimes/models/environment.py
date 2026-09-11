# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Environment models for Datalayer.

Provides data structures for environment management in Datalayer environments:
the entries of the environments listing, and the records of the registry of
user environments (PLAN_ENV.md, section 9). A version's specification, its
states and its capability reports are the canonical models of
``code_sandboxes.environments`` (D-14).
"""

from typing import Any, Dict, Generic, List, Optional, TypeVar

from code_sandboxes.environments.builders import CapabilityReport
from code_sandboxes.environments.lifecycle import VersionState
from code_sandboxes.environments.spec import Environment
from datalayer_core.utils.types import CreditsPerSecond
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

RecordT = TypeVar("RecordT")


class PromotedEnvironmentVersion(BaseModel):
    """The version a user environment's launches resolve to, as the listing names it."""

    uid: str = Field(..., description="Uid of the promoted version")
    version: Optional[int] = Field(default=None, description="Number of the version")
    status: Optional[VersionState] = Field(
        default=None, description="Where the version stands"
    )


class EnvironmentModel(BaseModel):
    """
    Pydantic model representing a Datalayer environment.

    Provides information about available computing environments
    including resources, packages, and configuration details.
    """

    name: str = Field(..., description="Name of the environment")
    title: str = Field(..., description="Title of the environment")
    burning_rate: CreditsPerSecond = Field(
        ..., description="The cost of running the environment per hour"
    )
    language: str = Field(..., description="Programming language for the environment")
    owner: str = Field(..., description="Owner of the environment")
    visibility: str = Field(..., description="Environment visibility (public/private)")
    uid: Optional[str] = Field(
        default=None,
        description="Registry uid of a user environment; None for a platform entry",
    )
    origin: Optional[str] = Field(
        default=None,
        description="`user` for a registry environment; None for a platform entry",
    )
    promoted_version: Optional[PromotedEnvironmentVersion] = Field(
        default=None,
        description="The version launches of a user environment resolve to",
    )
    variants: Optional[List[str]] = Field(
        default=None,
        description="The variants a user environment's promoted version builds for",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None, description="Additional metadata for the environment"
    )

    def __repr__(self) -> str:
        return f"EnvironmentModel(name='{self.name}', title='{self.title}')"


# -- The registry (PLAN_ENV.md, section 9) ---------------------------------------


class _RegistryRecord(BaseModel):
    """A registry answer: camelCase on the wire, and a field the service adds is kept."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="allow"
    )


class EnvironmentRecord(_RegistryRecord):
    """A user environment, as the registry answers it."""

    uid: str
    name: str
    title: str = ""
    description: str = ""
    origin: str = "user"
    owner_type: str
    owner_uid: str
    visibility: str
    promoted_version_uid: Optional[str] = None
    created_by: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    archived_at: Optional[str] = None
    deleted_at: Optional[str] = None
    #: What a conditional write names in ``if_match``.
    etag: str = ""


class EnvironmentVersionRecord(_RegistryRecord):
    """A version of an environment: its specification, and where it stands."""

    uid: str
    environment_uid: str
    owner_uid: str
    version: int
    label: str = ""
    spec: Environment
    spec_schema_version: str = ""
    spec_digest: str = ""
    contract_version: str = ""
    source_type: str = ""
    source_format: str = ""
    source_archive_ref: str = ""
    source_archive_digest: str = ""
    lock_digest: str = ""
    resolved_bases: Dict[str, str] = Field(default_factory=dict)
    status: VersionState
    required_variants: List[str] = Field(default_factory=list)
    optional_variants: List[str] = Field(default_factory=list)
    validation_summary: Dict[str, Any] = Field(default_factory=dict)
    failure_code: str = ""
    created_by: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    promoted_at: Optional[str] = None
    deprecated_at: Optional[str] = None
    #: What a conditional write names in ``if_match``.
    etag: str = ""


class EnvironmentBuildRecord(_RegistryRecord):
    """One build of one version, on one variant and region."""

    uid: str
    environment_uid: str
    version_uid: str
    owner_uid: str
    variant: str
    region: str
    attempt: int = 1
    idempotency_key: str = ""
    #: ``queued`` when created; ``succeeded``, ``failed`` and ``cancelled`` end it.
    status: str
    error_code: str = ""
    error_detail: str = ""
    cache_hit: bool = False
    correlation_id: str = ""
    requested_by: str = ""
    cancelled_by: str = ""
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    updated_at: Optional[str] = None
    #: What a conditional write names in ``if_match``.
    etag: str = ""


class EnvironmentArtifactRecord(_RegistryRecord):
    """The artifact of one version, on one variant and region."""

    uid: str
    environment_uid: str
    version_uid: str
    owner_uid: str
    variant: str
    region: str
    spec_digest: str = ""
    lock_digest: str = ""
    base_digest: str = ""
    provider_account: str = ""
    provider_namespace: str = ""
    provider_artifact_id: str = ""
    #: What a launch uses: an OCI digest, a template build, a snapshot id, an image id.
    immutable_reference: str = ""
    mutable_alias: str = ""
    status: str = ""
    architecture: str = ""
    contract_version: str = ""
    runtime_metadata: Dict[str, Any] = Field(default_factory=dict)
    size_bytes: int = 0
    sbom_ref: str = ""
    scan_summary: Dict[str, Any] = Field(default_factory=dict)
    provenance_ref: str = ""
    signature_ref: str = ""
    reference_count: int = 0
    last_used_at: Optional[str] = None
    retention_state: str = ""
    provider_verified_at: Optional[str] = None
    build_started_at: Optional[str] = None
    build_finished_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    #: What a conditional write names in ``if_match``.
    etag: str = ""


class EnvironmentBuildLogChunk(_RegistryRecord):
    """One chunk of a build's log, redacted before it was written (D-15)."""

    #: Dense from 0.
    sequence: int
    text: str
    size: int = 0
    created_at: Optional[str] = None


class EnvironmentBuildLogPage(_RegistryRecord):
    """A build's log chunks after a cursor, and whether the log is complete."""

    chunks: List[EnvironmentBuildLogChunk] = Field(default_factory=list)
    #: The sequence of the last chunk read, or the cursor given when nothing new was written.
    next_cursor: Optional[str] = None
    complete: bool = False


class EnvironmentValidationReport(_RegistryRecord):
    """What validating a version answers: a capability report per variant."""

    version_uid: str
    spec_digest: str = ""
    supported: bool
    reports: List[CapabilityReport] = Field(default_factory=list)

    @field_validator("reports", mode="before")
    @classmethod
    def _reports_without_supported(cls, value: Any) -> Any:
        """Drop each report's ``supported``, which ``CapabilityReport`` works out from its findings."""
        if not isinstance(value, list):
            return value
        return [
            {name: item for name, item in report.items() if name != "supported"}
            if isinstance(report, dict)
            else report
            for report in value
        ]


class EnvironmentsPage(BaseModel, Generic[RecordT]):
    """One page of a registry listing, and the cursor of the next one."""

    items: List[RecordT] = Field(default_factory=list)
    #: None once the listing is read.
    next_cursor: Optional[str] = None
