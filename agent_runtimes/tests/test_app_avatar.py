# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The avatar of an application written in Python: ``Application(avatar=…)``.

It writes the Appspec's ``interface.avatar`` — an id a plugin contributes, or a
3D model — and the spec refuses what it refuses in YAML, the old names included.
"""

from __future__ import annotations

import pytest
from agentspecs.apps import AppError

from agent_runtimes.loop.apps import Application


def _app(**kwargs: object) -> Application:
    return Application("avatar-py", "chat", agent="example-blank:0.0.1", **kwargs)


def test_an_avatar_by_id_is_written_as_the_spec_says_it() -> None:
    app = _app(avatar="wizard")
    assert app.document["interface"] == {"avatar": "wizard"}
    assert app.spec.interface.avatar == "wizard"


def test_a_3d_avatar_is_the_default_robot_or_a_model_at_an_address() -> None:
    robot = _app(avatar={"kind": "model3d"}).spec.interface.avatar
    assert robot is not None and not isinstance(robot, str)
    assert (robot.kind, robot.url) == ("model3d", "")
    url = "https://example.com/models/fox.glb"
    fox = _app(avatar={"kind": "model3d", "url": url}).spec.interface.avatar
    assert fox is not None and not isinstance(fox, str)
    assert (fox.kind, fox.url) == ("model3d", url)


def test_no_avatar_leaves_the_interface_unsaid() -> None:
    app = _app()
    assert "interface" not in app.document
    assert app.spec.interface.avatar is None


@pytest.mark.parametrize(
    "avatar, said",
    [
        ("Clippy", "an avatar is named by the id"),
        ({"kind": "model3d", "url": "http://example.com/fox.glb"}, "https address"),
        ({"kind": "vrm"}, "an avatar's kind is `model3d`"),
    ],
)
def test_an_avatar_the_spec_refuses_is_refused_in_python(
    avatar: object, said: str
) -> None:
    with pytest.raises((AppError, ValueError), match=said):
        _app(avatar=avatar).spec
