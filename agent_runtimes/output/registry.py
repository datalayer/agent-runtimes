# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Output generator registry — spec-driven factory for wiring output
generators based on agentspec configuration.
"""

from __future__ import annotations

import logging
from typing import Any

from .base import BaseOutputGenerator
from .pdf_generator import PDFOutputGenerator

logger = logging.getLogger(__name__)

# Global registry of output generator classes keyed by format name.
_REGISTRY: dict[str, type[BaseOutputGenerator]] = {
    "pdf": PDFOutputGenerator,
}


class OutputRegistry:
    """Spec-driven factory for creating output generators.

    Usage::

        registry = OutputRegistry()

        # Register custom generators
        registry.register("csv", CSVOutputGenerator)

        # Create from agentspec configuration
        generator = registry.create_from_spec({
            "format": "pdf",
            "template": "/templates/report.html",
            "sandbox_url": "http://sandbox:8888",
            "output_dir": "/results",
        })
    """

    def __init__(self) -> None:
        self._generators: dict[str, type[BaseOutputGenerator]] = dict(_REGISTRY)

    def register(
        self,
        format_name: str,
        generator_class: type[BaseOutputGenerator],
    ) -> None:
        """Register a new output format."""
        self._generators[format_name] = generator_class
        logger.info("Registered output generator: %s", format_name)

    def list_formats(self) -> list[str]:
        """Return available output format names."""
        return list(self._generators.keys())

    def create(self, format_name: str, **kwargs: Any) -> BaseOutputGenerator:
        """Create an output generator by format name."""
        cls = self._generators.get(format_name)
        if cls is None:
            raise ValueError(
                f"Unknown output format '{format_name}'. "
                f"Available: {self.list_formats()}"
            )
        return cls(**kwargs)

    def create_from_spec(self, spec_config: dict[str, Any]) -> BaseOutputGenerator:
        """Create an output generator from agentspec output configuration.

        Expected spec_config keys:
            format: str  — e.g. "pdf"
            template: str | None — optional template path
            sandbox_url: str — Jupyter sandbox URL
            output_dir: str — directory for output files
            ... additional generator-specific keys
        """
        format_name = spec_config.get("format", "pdf")
        kwargs: dict[str, Any] = {}

        if format_name == "pdf":
            if "template" in spec_config:
                kwargs["template_path"] = spec_config["template"]
            if "sandbox_url" in spec_config:
                kwargs["sandbox_url"] = spec_config["sandbox_url"]
            if "output_dir" in spec_config:
                kwargs["output_dir"] = spec_config["output_dir"]
        else:
            # Pass through all keys except 'format'
            kwargs = {k: v for k, v in spec_config.items() if k != "format"}

        return self.create(format_name, **kwargs)


# Module-level convenience -------------------------------------------------

_default_registry: OutputRegistry | None = None


def get_default_registry() -> OutputRegistry:
    """Return (and lazily create) the default output registry."""
    global _default_registry
    if _default_registry is None:
        _default_registry = OutputRegistry()
    return _default_registry


def create_output_generator(
    spec_config: dict[str, Any],
) -> BaseOutputGenerator:
    """Convenience: create a generator from spec config using the default registry."""
    return get_default_registry().create_from_spec(spec_config)
