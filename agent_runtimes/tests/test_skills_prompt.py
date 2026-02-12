# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for generate_skills_prompt_section."""

from agent_runtimes.services.agent_factory import generate_skills_prompt_section


class TestGenerateSkillsPromptSection:
    """Tests for the skills system-prompt generator."""

    def test_empty_metadata_returns_empty_string(self) -> None:
        assert generate_skills_prompt_section([]) == ""

    def test_returns_markdown_with_skills_header(self) -> None:
        metadata = [
            {
                "name": "github",
                "description": "GitHub integration tools",
                "scripts": [],
            }
        ]
        result = generate_skills_prompt_section(metadata)
        assert "## Available Skills" in result
        assert "### Installed Skills" in result
        assert "`github`" in result
        assert "GitHub integration tools" in result

    def test_includes_function_signatures_table(self) -> None:
        metadata = [{"name": "test", "description": "Test skill"}]
        result = generate_skills_prompt_section(metadata)
        assert "### Skill Functions" in result
        assert "`list_skills`" in result
        assert "`run_skill`" in result
        assert "`load_skill`" in result
        assert "`read_skill_resource`" in result
        assert "from generated.skills import" in result

    def test_includes_script_parameters(self) -> None:
        metadata = [
            {
                "name": "github",
                "description": "GitHub tools",
                "scripts": [
                    {
                        "name": "list_repos",
                        "description": "List repositories",
                        "parameters": [
                            {
                                "name": "org",
                                "type": "str",
                                "description": "Organization name",
                                "required": True,
                            },
                            {
                                "name": "limit",
                                "type": "int",
                                "description": "Max results",
                            },
                        ],
                        "returns": "JSON list of repos",
                        "usage": "python list_repos.py --org datalayer",
                        "env_vars": ["GITHUB_TOKEN"],
                    }
                ],
            }
        ]
        result = generate_skills_prompt_section(metadata)
        # Script name and description
        assert "`list_repos`" in result
        assert "List repositories" in result
        # Parameters
        assert "`--org`" in result
        assert "(str, required)" in result
        assert "Organization name" in result
        assert "`--limit`" in result
        assert "(int)" in result
        # Returns
        assert "JSON list of repos" in result
        # Usage
        assert "python list_repos.py --org datalayer" in result
        # Env vars
        assert "`GITHUB_TOKEN`" in result

    def test_includes_resources(self) -> None:
        metadata = [
            {
                "name": "myskill",
                "description": "My skill",
                "resources": [
                    {"name": "config.json"},
                    {"name": "template.txt"},
                ],
            }
        ]
        result = generate_skills_prompt_section(metadata)
        assert "`config.json`" in result
        assert "`template.txt`" in result
        assert "**Resources:**" in result

    def test_includes_usage_example(self) -> None:
        metadata = [
            {
                "name": "github",
                "description": "GitHub tools",
                "scripts": [
                    {
                        "name": "list_repos",
                        "description": "List repos",
                        "parameters": [
                            {"name": "org", "type": "str", "description": "Org"},
                        ],
                    }
                ],
            }
        ]
        result = generate_skills_prompt_section(metadata)
        assert "### Example" in result
        assert 'await run_skill("github", "list_repos"' in result
        assert 'result["success"]' in result

    def test_multiple_skills(self) -> None:
        metadata = [
            {"name": "github", "description": "GitHub integration"},
            {"name": "slack", "description": "Slack messaging"},
        ]
        result = generate_skills_prompt_section(metadata)
        assert "`github`" in result
        assert "`slack`" in result
        assert "GitHub integration" in result
        assert "Slack messaging" in result

    def test_run_skill_signature_in_table(self) -> None:
        """Ensure the function table documents the CLI-style args pattern."""
        metadata = [{"name": "x", "description": "x"}]
        result = generate_skills_prompt_section(metadata)
        assert "skill_name, script_name, args" in result
        assert '["--org", "datalayer"]' in result

    def test_script_without_parameters(self) -> None:
        metadata = [
            {
                "name": "util",
                "description": "Utilities",
                "scripts": [
                    {"name": "cleanup", "description": "Clean up temp files"},
                ],
            }
        ]
        result = generate_skills_prompt_section(metadata)
        assert "`cleanup`" in result
        assert "Clean up temp files" in result
