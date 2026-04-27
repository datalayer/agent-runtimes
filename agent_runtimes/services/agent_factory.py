# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Factory Service.

Provides shared logic for creating agents with skills and codemode toolsets.
Used by both app.py (CLI agents) and routes/agents.py (API agents).
"""

import logging
import os
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)


def create_skills_toolset(
    skills: list[str],
    skills_path: str,
    shared_sandbox: Any | None = None,
) -> Any | None:
    """
    Create an AgentSkillsToolset with the specified skills.

    Skills are loaded via two complementary mechanisms, tried in order:

    **Path-based** (Variant 1 + 1c): walk ``skills_path`` recursively and
    load every sub-directory that contains a ``SKILL.md`` file.  Skill
    scripts are read from the local filesystem, so the path must be
    accessible at runtime.  In the Datalayer SaaS Kubernetes pod the
    entrypoint copies ``/opt/datalayer/skills/`` to the shared emptyDir
    volume (``/mnt/shared-agent/skills/``); the ``AGENT_RUNTIMES_SKILLS_FOLDER``
    env var then points here so *both* the agent-runtimes container (which
    reads the SKILL.md files) and the Jupyter kernel container (which
    executes the script code sent to it by the SandboxExecutor) can reach
    the same files.

    **Module-based** (Variant 1b): for each skill whose catalog spec has a
    ``module`` field, import the Python package and locate the ``SKILL.md``
    via ``AgentSkill.from_module()``.  Works for both regular packages and
    namespace packages (directories without ``__init__.py``).  Requires only
    that ``agent-skills`` (or whatever provides the skills) is pip-installed
    — no separate on-disk copy is needed.  Script code is still read from
    the installed package path and sent as a string to the sandbox for
    execution, so scripts run on the sandbox side regardless of which
    loading mechanism was used.

    **Package-based** (Variant 2): for catalog specs with a ``package`` +
    ``method`` field, import the package and wrap a Python callable directly
    (no script file needed).

    Args:
        skills: List of skill name references to load (may include version
            suffix, e.g. ``"crawl:0.0.1"``).
        skills_path: Path to a local skills directory scanned for SKILL.md
            files (path-based loading).  Set
            ``AGENT_RUNTIMES_SKILLS_FOLDER=/mnt/shared-agent/skills`` in the
            Kubernetes pod to point at the shared volume.
        shared_sandbox: Optional shared sandbox for state persistence.

    Returns:
        AgentSkillsToolset instance, or ``None`` if agent-skills is not
        available.
    """
    try:
        from agent_skills import (
            PYDANTIC_AI_AVAILABLE,
            AgentSkill,
            AgentSkillsToolset,
            SandboxExecutor,
        )

        if not PYDANTIC_AI_AVAILABLE:
            logger.warning("agent-skills pydantic-ai integration not available")
            return None

        def _skill_id_from_ref(ref: str) -> str:
            base, _, ver = ref.rpartition(":")
            if base and "." in ver:
                return base
            return ref

        selected_ids = {_skill_id_from_ref(s) for s in skills if s}
        selected_skills: list[AgentSkill] = []
        loaded_ids: set[str] = set()
        loaded_skill_names: set[str] = set()

        # ---------------------------------------------------------------------------
        # Path-based loading (Variant 1): scan skills_path for SKILL.md files.
        # In K8s the AGENT_RUNTIMES_SKILLS_FOLDER env var points to the shared
        # emptyDir volume (/mnt/shared-agent/skills) populated by entrypoint.sh.
        # ---------------------------------------------------------------------------
        for skill_md in Path(skills_path).rglob("SKILL.md"):
            try:
                skill = AgentSkill.from_skill_md(skill_md)
            except Exception as exc:
                logger.warning(f"Failed to load skill from {skill_md}: {exc}")
                continue
            if skill.name in selected_ids and skill.name not in loaded_skill_names:
                selected_skills.append(skill)
                loaded_ids.add(skill.name)
                loaded_skill_names.add(skill.name)
                logger.info(f"Loaded skill (name-based): {skill.name}")

        # ---------------------------------------------------------------------------
        # Catalog-based loading: for skills not found in skills_path, consult
        # the skill catalog spec to try module-based, path-based, or
        # package-based loading.
        # ---------------------------------------------------------------------------
        missing_ids = selected_ids - loaded_ids
        if missing_ids:
            get_skill_spec: Callable[[str], Any | None] | None
            try:
                from ..specs.skills import get_skill_spec as _get_skill_spec
            except ImportError:
                get_skill_spec = None
            else:
                get_skill_spec = _get_skill_spec

            if get_skill_spec is not None:
                for skill_name in sorted(missing_ids):
                    spec = get_skill_spec(skill_name)
                    if spec is None:
                        continue

                    # Module-based (Variant 1b): import the Python package and
                    # locate SKILL.md via AgentSkill.from_module().  Works for
                    # both regular and namespace packages.
                    spec_module = getattr(spec, "module", None)
                    if spec_module and skill_name not in loaded_ids:
                        try:
                            skill = AgentSkill.from_module(spec_module)
                            if skill.name not in loaded_skill_names:
                                selected_skills.append(skill)
                                loaded_ids.add(skill_name)
                                loaded_skill_names.add(skill.name)
                                logger.info(
                                    f"Loaded skill (module-based): {skill.name} "
                                    f"from {spec_module}"
                                )
                        except Exception as exc:
                            logger.warning(
                                f"Failed to load module-based skill '{skill_name}' "
                                f"from {spec_module}: {exc}"
                            )

                    # Path-based from catalog (Variant 1c): the catalog spec
                    # declares a relative path resolved under skills_path.
                    spec_path = getattr(spec, "path", None)
                    if spec_path and skill_name not in loaded_ids:
                        candidate = Path(spec_path)
                        if not candidate.is_absolute():
                            candidate = Path(skills_path) / candidate
                        skill_md = (
                            candidate
                            if candidate.name == "SKILL.md"
                            else candidate / "SKILL.md"
                        )
                        if skill_md.exists():
                            try:
                                skill = AgentSkill.from_skill_md(skill_md)
                                if skill.name not in loaded_skill_names:
                                    selected_skills.append(skill)
                                    loaded_ids.add(skill_name)
                                    loaded_skill_names.add(skill.name)
                                    logger.info(
                                        f"Loaded skill (path-based): {skill.name} "
                                        f"from {skill_md}"
                                    )
                            except Exception as exc:
                                logger.warning(
                                    f"Failed to load path-based skill '{skill_name}' "
                                    f"from {skill_md}: {exc}"
                                )
                        else:
                            logger.warning(
                                f"Path-based skill '{skill_name}' not found at {skill_md}"
                            )

                    # Package-based (Variant 2): catalog spec with package +
                    # method; wraps a Python callable, no script file needed.
                    if spec.package and spec.method and skill_name not in loaded_ids:
                        try:
                            skill = AgentSkill.from_package(
                                package=spec.package,
                                method=spec.method,
                                name=spec.name,
                                description=spec.description,
                                version=spec.version,
                                tags=list(spec.tags) if spec.tags else None,
                            )
                            selected_skills.append(skill)
                            loaded_ids.add(skill_name)
                            loaded_skill_names.add(skill.name)
                            logger.info(
                                f"Loaded skill (package-based): {skill_name} "
                                f"from {spec.package}.{spec.method}"
                            )
                        except Exception as exc:
                            logger.warning(
                                f"Failed to load package-based skill '{skill_name}': {exc}"
                            )

            still_missing = selected_ids - loaded_ids
            if still_missing:
                logger.warning(f"Requested skills not found: {sorted(still_missing)}")

        # Create executor - use shared sandbox if available
        if shared_sandbox is not None:
            executor = SandboxExecutor(shared_sandbox)
            logger.info("Using shared managed sandbox for skills executor")
        else:
            # Use CodeSandboxManager for skills-only sandbox
            from .code_sandbox_manager import get_code_sandbox_manager

            sandbox_manager = get_code_sandbox_manager()

            # Configure if Jupyter sandbox URL is provided
            jupyter_sandbox_url = os.getenv("AGENT_RUNTIMES_JUPYTER_SANDBOX")
            if jupyter_sandbox_url:
                sandbox_manager.configure_from_url(jupyter_sandbox_url)
            else:
                sandbox_manager.configure(variant="eval")

            skills_sandbox = sandbox_manager.get_managed_sandbox()
            executor = SandboxExecutor(skills_sandbox)

        skills_toolset = AgentSkillsToolset(
            skills=selected_skills,
            executor=executor,
        )
        logger.info(f"Created AgentSkillsToolset with {len(selected_skills)} skills")
        return skills_toolset

    except ImportError as e:
        logger.warning(f"agent-skills package not installed, skills disabled: {e}")
        return None


def create_codemode_toolset(
    mcp_servers: list[Any],
    workspace_path: str,
    generated_path: str,
    skills_path: str,
    allow_direct_tool_calls: bool = False,
    shared_sandbox: Any | None = None,
    mcp_proxy_url: str | None = None,
    enable_discovery_tools: bool = True,
    status_change_callback: Any | None = None,
    sandbox_variant: str | None = None,
) -> Any | None:
    """
    Create a CodemodeToolset with the specified MCP servers.

    Args:
        mcp_servers: List of MCP server objects to register
        workspace_path: Path to the workspace directory
        generated_path: Path to the generated code directory
        skills_path: Path to the skills directory
        allow_direct_tool_calls: Whether to allow direct tool calls
        shared_sandbox: Optional shared sandbox for state persistence
        mcp_proxy_url: Optional MCP proxy URL for Jupyter/remote execution
        enable_discovery_tools: Whether to enable discovery tools (default: True)
        sandbox_variant: Sandbox variant ('eval', 'jupyter').
            If None, reads from the CodeSandboxManager's current config.

    Returns:
        CodemodeToolset instance or None if codemode not available
    """
    try:
        from agent_codemode import (
            PYDANTIC_AI_AVAILABLE as CODEMODE_AVAILABLE,
        )
        from agent_codemode import (
            CodeModeConfig,
            CodemodeToolset,
            MCPServerConfig,
            ToolRegistry,
        )

        if not CODEMODE_AVAILABLE:
            logger.warning("agent-codemode pydantic-ai integration not available")
            return None

        # Build registry with MCP servers
        registry = ToolRegistry()

        for mcp_server in mcp_servers:
            if not mcp_server.enabled:
                logger.debug(f"Skipping disabled MCP server: {mcp_server.id}")
                continue

            # Normalize server name to valid Python identifier
            normalized_name = "".join(
                c if c.isalnum() or c == "_" else "_" for c in mcp_server.id
            )

            # Gather environment variables for the server
            server_env: dict[str, str] = {}

            # Add required env vars
            for env_key in mcp_server.required_env_vars:
                env_val = os.getenv(env_key)
                if env_val:
                    server_env[env_key] = env_val

            # Add any custom env from mcp_server.env (with expansion)
            if mcp_server.env:
                import re

                for env_key, env_value in mcp_server.env.items():
                    # Expand ${VAR} syntax
                    if isinstance(env_value, str) and "${" in env_value:
                        pattern = r"\$\{([^}]+)\}"

                        def replace(match: re.Match[str]) -> str:
                            var_name = match.group(1)
                            return os.environ.get(var_name, "")

                        expanded_value = re.sub(pattern, replace, env_value)
                        server_env[env_key] = expanded_value
                    else:
                        server_env[env_key] = env_value

            registry.add_server(
                MCPServerConfig(
                    name=normalized_name,
                    url=mcp_server.url if mcp_server.transport == "http" else "",
                    command=mcp_server.command or "",
                    args=mcp_server.args or [],
                    env=server_env,
                    enabled=mcp_server.enabled,
                )
            )
            logger.info(f"Added MCP server to codemode registry: {normalized_name}")

        # Create config with conditional mcp_proxy_url
        config_kwargs = {
            "workspace_path": workspace_path,
            "generated_path": generated_path,
            "skills_path": skills_path,
            "allow_direct_tool_calls": allow_direct_tool_calls,
        }

        # Add mcp_proxy_url if provided (for Jupyter/remote execution)
        if mcp_proxy_url:
            config_kwargs["mcp_proxy_url"] = mcp_proxy_url

        # Determine sandbox_variant: explicit param > manager config > default
        effective_variant = sandbox_variant
        if not effective_variant:
            try:
                from .code_sandbox_manager import get_code_sandbox_manager

                effective_variant = get_code_sandbox_manager().config.variant
            except Exception:
                pass
        if effective_variant:
            config_kwargs["sandbox_variant"] = effective_variant

        # When discovery tools are disabled, treat this as sandbox-only mode
        # and prevent the executor from materializing ``generated/`` bindings
        # or extending the sandbox ``sys.path``.
        if not enable_discovery_tools:
            config_kwargs["setup_generated_modules"] = False

        codemode_config = CodeModeConfig(**config_kwargs)

        logger.info(
            f"Codemode config: generated_path={codemode_config.generated_path}, "
            f"skills_path={codemode_config.skills_path}, "
            f"mcp_proxy_url={getattr(codemode_config, 'mcp_proxy_url', None)}"
        )

        codemode_toolset = CodemodeToolset(
            registry=registry,
            config=codemode_config,
            sandbox=shared_sandbox,
            allow_discovery_tools=enable_discovery_tools,
            status_change_callback=status_change_callback,
        )
        # Track whether this CodemodeToolset is full codemode (discovery on)
        # or sandbox-only execute_code mode (discovery off).
        setattr(
            codemode_toolset,
            "_agent_runtimes_discovery_enabled",
            enable_discovery_tools,
        )

        logger.info("Created CodemodeToolset")
        return codemode_toolset

    except ImportError as e:
        logger.warning(f"agent-codemode package not installed, codemode disabled: {e}")
        return None


async def initialize_codemode_toolset(codemode_toolset: Any) -> None:
    """
    Initialize a codemode toolset (start and discover tools).

    Args:
        codemode_toolset: The CodemodeToolset instance to initialize
    """
    if codemode_toolset is None:
        return

    try:
        # Initialize the toolset
        logger.info("Starting codemode toolset...")
        await codemode_toolset.start()

        # Log discovered tools
        if codemode_toolset.registry:
            discovered_tools = codemode_toolset.registry.list_tools(
                include_deferred=True
            )
            tool_names = [t.name for t in discovered_tools]
            logger.info(f"Codemode discovered {len(tool_names)} tools: {tool_names}")

        logger.info("Codemode toolset initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize codemode toolset: {e}")
        raise


def create_shared_sandbox(
    jupyter_sandbox_url: str | None = None,
) -> Any | None:
    """
    Create a shared managed sandbox proxy.

    The proxy always delegates to the manager's current sandbox, so when
    the manager is reconfigured (e.g. eval → jupyter),
    all consumers automatically use the new sandbox.

    Args:
        jupyter_sandbox_url: Optional Jupyter server URL (with token)

    Returns:
        ManagedSandbox proxy or None if code_sandboxes not available
    """
    try:
        from .code_sandbox_manager import get_code_sandbox_manager

        sandbox_manager = get_code_sandbox_manager()

        # Configure if Jupyter sandbox URL is provided
        if jupyter_sandbox_url:
            sandbox_manager.configure_from_url(jupyter_sandbox_url)
            logger.info(
                f"Configured sandbox manager for Jupyter: {jupyter_sandbox_url.split('?')[0]}"
            )
        else:
            # In sidecar mode, default to jupyter (companion will
            # provide the URL later).  Never fall back to eval when
            # a jupyter sidecar is expected.
            jupyter_sidecar = (
                os.getenv("DATALAYER_RUNTIME_JUPYTER_SIDECAR", "").lower() == "true"
            )
            if jupyter_sidecar:
                sandbox_manager.configure(variant="jupyter")
                logger.info(
                    "Sidecar mode: configured sandbox as jupyter "
                    "(waiting for companion to provide jupyter URL)"
                )
            else:
                sandbox_manager.configure(variant="eval")

        shared_sandbox = sandbox_manager.get_managed_sandbox()
        logger.info(
            f"Created managed sandbox proxy (variant={sandbox_manager.variant})"
        )
        return shared_sandbox

    except ImportError as e:
        logger.warning(
            f"code_sandboxes not installed, cannot create shared sandbox: {e}"
        )
        return None


def generate_skills_prompt_section(skills_metadata: list[dict[str, Any]]) -> str:
    """
    Generate a system prompt section describing available skills.

    Produces a Markdown section that gives the LLM visibility into the
    installed skills, their scripts, parameters, return values, and
    usage examples so it can call ``run_skill()`` correctly without
    needing to call ``list_skills()`` first for discovery.

    Args:
        skills_metadata: List of skill metadata dicts as built by
            ``wire_skills_into_codemode``.

    Returns:
        A Markdown string suitable for appending to the system prompt.
        Returns an empty string if no skills are available.
    """
    if not skills_metadata:
        return ""

    lines: list[str] = []
    lines.append("## Available Skills")
    lines.append("")
    lines.append(
        "You have access to pre-built **skills** alongside MCP tools. "
        "Skills are domain-specific scripts you can run via `execute_code`."
    )
    lines.append("")
    lines.append("### Skill Functions")
    lines.append("Import in execute_code with:")
    lines.append(
        "```python\n"
        "from generated.skills import list_skills, load_skill, run_skill, "
        "read_skill_resource\n```"
    )
    lines.append("")
    lines.append("| Function | Signature | Purpose |")
    lines.append("|---|---|---|")
    lines.append(
        "| `list_skills` | `await list_skills()` → `list[dict]` | "
        "Returns full catalog with parameter details |"
    )
    lines.append(
        "| `load_skill` | `await load_skill(skill_name)` → `str` | "
        "Returns SKILL.md documentation |"
    )
    lines.append(
        "| `run_skill` | `await run_skill(skill_name, script_name, args)` "
        "→ `dict` | Execute a script. `args` is a list of CLI-style "
        'strings, e.g. `["--org", "datalayer"]`. Result dict has '
        "keys: `success`, `output`, `exit_code`, `error`, `execution_time` |"
    )
    lines.append(
        "| `read_skill_resource` | "
        "`await read_skill_resource(skill_name, resource_name)` → `str` | "
        "Read a resource file |"
    )
    lines.append("")

    # Per-skill details
    lines.append("### Installed Skills")
    lines.append("")

    for skill in skills_metadata:
        skill_name = skill.get("name", "unknown")
        skill_desc = skill.get("description", "")
        lines.append(f"#### `{skill_name}`")
        if skill_desc:
            lines.append(skill_desc)
        lines.append("")

        scripts = skill.get("scripts", [])
        if scripts:
            lines.append("**Scripts:**")
            lines.append("")
            for script in scripts:
                sname = script.get("name", "")
                sdesc = script.get("description", "")
                lines.append(f"- **`{sname}`**" + (f" — {sdesc}" if sdesc else ""))

                # Parameters
                params = script.get("parameters", [])
                if params:
                    param_parts = []
                    for p in params:
                        pname = p.get("name", "")
                        ptype = p.get("type", "")
                        pdesc = p.get("description", "")
                        preq = p.get("required", False)
                        part = f"`--{pname}`"
                        if ptype:
                            part += f" ({ptype}"
                            if preq:
                                part += ", required"
                            part += ")"
                        if pdesc:
                            part += f": {pdesc}"
                        param_parts.append(part)
                    lines.append("  Parameters: " + " | ".join(param_parts))

                # Returns
                returns = script.get("returns", "")
                if returns:
                    lines.append(f"  Returns: {returns}")

                # Usage
                usage = script.get("usage", "")
                if usage:
                    lines.append(f"  Usage: `{usage}`")

                # Environment variables
                env_vars = script.get("env_vars", [])
                if env_vars:
                    lines.append("  Env vars: " + ", ".join(f"`{v}`" for v in env_vars))

            lines.append("")

        resources = skill.get("resources", [])
        if resources:
            res_names = ", ".join(f"`{r.get('name', '')}`" for r in resources)
            lines.append(f"**Resources:** {res_names}")
            lines.append("")

    # Usage example
    if skills_metadata:
        example_skill = skills_metadata[0]
        example_scripts = example_skill.get("scripts", [])
        if example_scripts:
            example_script = example_scripts[0]
            example_args = ""
            params = example_script.get("parameters", [])
            if params:
                # Build example args from first 1-2 parameters
                example_arg_parts = []
                for p in params[:2]:
                    pname = p.get("name", "")
                    example_arg_parts.append(f'"--{pname}"')
                    example_arg_parts.append(f'"<{pname}>"')
                example_args = ", ".join(example_arg_parts)

            lines.append("### Example")
            lines.append("```python")
            lines.append("from generated.skills import run_skill")
            lines.append("")
            lines.append(
                f'result = await run_skill("{example_skill["name"]}", '
                f'"{example_script["name"]}", '
                f"[{example_args}])"
            )
            lines.append('if result["success"]:')
            lines.append('    print(result["output"])')
            lines.append("else:")
            lines.append("    print(f\"Error: {result['error']}\")")
            lines.append("```")
            lines.append("")

    return "\n".join(lines)


def wire_skills_into_codemode(
    codemode_toolset: Any,
    skills_toolset: Any,
) -> str:
    """
    Wire skill bindings and routing into a codemode toolset.

    This performs three things:

    1. **Generates skill bindings** under ``generated/skills/`` so
       that ``execute_code`` can ``from generated.skills import run_skill``.
    2. **Sets a skill tool caller** on the codemode executor so that
       ``call_tool("skills__<name>", args)`` is routed to the skills
       toolset instead of the MCP registry.
    3. **Returns a system prompt section** describing the installed
       skills, their scripts, parameters, and usage so the LLM has
       full visibility into the skill catalog.

    Must be called *after* ``initialize_codemode_toolset`` so the
    executor and codegen are ready.

    Args:
        codemode_toolset: An initialised ``CodemodeToolset`` instance.
        skills_toolset: An initialised ``AgentSkillsToolset`` instance.

    Returns:
        A Markdown string for appending to the system prompt, or ``""``
        if skills could not be wired.
    """
    if codemode_toolset is None or skills_toolset is None:
        return ""

    executor = getattr(codemode_toolset, "_executor", None)
    if executor is None:
        logger.warning("wire_skills_into_codemode: codemode executor not initialised")
        return ""

    # --- 1. Generate skill bindings -------------------------------------------
    codegen = getattr(executor, "_codegen", None)
    discovered = getattr(skills_toolset, "_discovered_skills", {})
    skills_metadata: list[dict[str, Any]] = []

    if codegen is not None and discovered:
        # Import schema extraction helper from agent-skills
        _extract_schema = None
        try:
            from agent_skills.toolset import AgentSkill

            _extract_schema = AgentSkill._extract_script_schema
        except (ImportError, AttributeError):
            pass

        skills_metadata.clear()
        for skill in discovered.values():
            entry: dict[str, Any] = {
                "name": getattr(skill, "name", ""),
                "description": getattr(skill, "description", ""),
            }
            scripts = getattr(skill, "scripts", [])
            if scripts:
                script_entries = []
                for s in scripts:
                    script_entry: dict[str, Any] = {
                        "name": s.name,
                        "description": getattr(s, "description", ""),
                    }
                    # Enrich with schema extracted from the script file
                    script_path = getattr(s, "path", None)
                    if _extract_schema and script_path and script_path.exists():
                        try:
                            schema = _extract_schema(script_path)
                            if schema.get("parameters"):
                                script_entry["parameters"] = schema["parameters"]
                            if schema.get("returns"):
                                script_entry["returns"] = schema["returns"]
                            if schema.get("usage"):
                                script_entry["usage"] = schema["usage"]
                            if schema.get("env_vars"):
                                script_entry["env_vars"] = schema["env_vars"]
                        except Exception as exc:
                            logger.debug(
                                "Failed to extract schema from %s: %s",
                                script_path,
                                exc,
                            )
                    script_entries.append(script_entry)
                entry["scripts"] = script_entries
            resources = getattr(skill, "resources", [])
            if resources:
                entry["resources"] = [{"name": r.name} for r in resources]
            skills_metadata.append(entry)

        try:
            codegen.generate_skill_bindings(skills_metadata)
            logger.info("Generated skill bindings for %d skills", len(skills_metadata))
        except Exception as exc:
            logger.error("Failed to generate skill bindings: %s", exc)

        # Store metadata so remote sandbox codegen can regenerate bindings.
        # Then immediately generate skill bindings in the sandbox — this is
        # necessary because _generate_tools_in_sandbox() ran during
        # executor.setup() before skills metadata was available.
        if hasattr(executor, "set_skills_metadata"):
            executor.set_skills_metadata(skills_metadata)
        if hasattr(executor, "generate_skills_in_sandbox"):
            executor.generate_skills_in_sandbox()
            logger.info(
                "Generated skill bindings in remote sandbox for %d skills",
                len(skills_metadata),
            )

    # --- 2. Set skill tool caller ---------------------------------------------
    async def _skill_tool_caller(tool_name: str, arguments: dict[str, Any]) -> Any:
        """Route skill__* tool calls to the skills toolset."""
        # Strip the 'skills__' prefix to get the bare tool name
        if tool_name.startswith("skills__"):
            bare_name = tool_name[len("skills__") :]
        else:
            bare_name = tool_name

        # Ensure skills toolset is initialised
        ensure = getattr(skills_toolset, "_ensure_initialized", None)
        if ensure:
            await ensure()

        if bare_name == "list_skills":
            return skills_toolset._list_skills()
        elif bare_name == "load_skill":
            return skills_toolset._load_skill(arguments.get("skill_name", ""))
        elif bare_name == "read_skill_resource":
            return await skills_toolset._read_skill_resource(
                arguments.get("skill_name", ""),
                arguments.get("resource_name", ""),
            )
        elif bare_name == "run_skill_script":
            return await skills_toolset._run_skill_script(
                arguments.get("skill_name", ""),
                arguments.get("script_name", ""),
                arguments.get("args", []),
                ctx=None,  # No RunContext when called from codemode
            )
        else:
            raise ValueError(f"Unknown skill tool: {bare_name}")

    executor.set_skill_tool_caller(_skill_tool_caller)
    logger.info("Wired skill tool caller into codemode executor")

    # --- 3. Register proxy caller for remote sandbox HTTP routing -------------
    try:
        from ..routes.mcp_proxy import set_skills_proxy_caller

        set_skills_proxy_caller(_skill_tool_caller)
    except ImportError:
        pass  # mcp_proxy route not available (standalone usage)

    # --- 4. Generate system prompt section for skill visibility ----------------
    return generate_skills_prompt_section(skills_metadata)
