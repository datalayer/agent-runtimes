# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The sign-in browser's pointer and keys, as a hand makes them.

On r1 (15 November 2026) reCAPTCHA Enterprise looped its image challenge on
LinkedIn's sign-in: the browser clicked in one instant at one point and typed
with no key. The user chose "Human-like browser first".
"""

from __future__ import annotations

import asyncio
import math
import random
from typing import Any, Dict, List, Optional, Tuple

import pytest

from agent_runtimes.apps import browser as browsers
from agent_runtimes.apps import human_input
from agent_runtimes.apps.browser import HEIGHT, WIDTH, ChromiumBrowser
from agent_runtimes.apps.human_input import (
    KEY_GAP,
    KEY_HOLD,
    MOVE_GAP,
    SHIFT,
    click_timing,
    keystrokes,
    mouse_path,
)

# --- the pointer ----------------------------------------------------------------------------


@pytest.mark.parametrize("seed", range(20))
def test_a_click_travels_from_where_the_pointer_was(seed: int) -> None:
    rng = random.Random(seed)
    start, end = (100.0, 700.0), (900.0, 240.0)
    path = mouse_path(start, end, rng, WIDTH, HEIGHT)
    assert 6 <= len(path) <= 24
    # It lands exactly where the person clicked on the screenshot.
    assert path[-1][:2] == end
    # Each move 10 to 25 ms after the last.
    assert all(MOVE_GAP[0] <= wait <= MOVE_GAP[1] for _, _, wait in path)
    # Not a jump: no move covers most of the way, and it heads to the target.
    points = [start] + [(x, y) for x, y, _ in path]
    distance = math.dist(start, end)
    steps = [math.dist(a, b) for a, b in zip(points, points[1:])]
    assert max(steps) < distance / 2
    assert math.dist(points[len(points) // 2], end) < distance
    # Never off the page.
    assert all(0 <= x <= WIDTH and 0 <= y <= HEIGHT for x, y, _ in path)


def test_no_two_travels_are_the_same_and_none_is_a_straight_line() -> None:
    start, end = (200.0, 200.0), (1000.0, 600.0)
    first = mouse_path(start, end, random.Random(1), WIDTH, HEIGHT)
    second = mouse_path(start, end, random.Random(2), WIDTH, HEIGHT)
    assert first != second

    def off_the_line(point: Tuple[float, float]) -> float:
        (x0, y0), (x1, y1), (x, y) = start, end, point
        return abs((y1 - y0) * x - (x1 - x0) * y + x1 * y0 - y1 * x0) / math.dist(
            start, end
        )

    assert max(off_the_line((x, y)) for x, y, _ in first[:-1]) > 0.5


def test_a_click_on_the_spot_still_moves_a_little_and_lands_there() -> None:
    path = mouse_path((50.0, 60.0), (50.0, 60.0), random.Random(3), WIDTH, HEIGHT)
    assert len(path) == 6
    assert path[-1][:2] == (50.0, 60.0)


def test_near_the_edge_the_jitter_stays_on_the_page() -> None:
    for seed in range(30):
        path = mouse_path((0.0, 0.0), (1.0, 1.0), random.Random(seed), WIDTH, HEIGHT)
        assert all(x >= 0 and y >= 0 for x, y, _ in path)


def test_the_button_rests_then_is_held() -> None:
    for seed in range(20):
        rest, hold = click_timing(random.Random(seed))
        assert 0.06 <= rest <= 0.18
        assert 0.05 <= hold <= 0.12


# --- the keys -------------------------------------------------------------------------------


def _typed(strokes: List[Tuple[Dict[str, Any], float]]) -> str:
    return "".join(event["text"] for event, _ in strokes if event["type"] == "char")


def test_each_character_is_its_own_key() -> None:
    strokes = keystrokes("ab", random.Random(0))
    assert [event["type"] for event, _ in strokes] == [
        "rawKeyDown",
        "char",
        "keyUp",
        "rawKeyDown",
        "char",
        "keyUp",
    ]
    down, char, up = (event for event, _ in strokes[:3])
    assert down == {
        "type": "rawKeyDown",
        "key": "a",
        "code": "KeyA",
        "windowsVirtualKeyCode": 65,
        "modifiers": 0,
    }
    assert char["text"] == "a" and char["code"] == "KeyA"
    assert up["type"] == "keyUp" and up["code"] == "KeyA"
    assert "insertText" not in str(strokes)


def test_a_capital_and_a_symbol_hold_shift() -> None:
    strokes = keystrokes("P!", random.Random(0))
    kinds = [(event["type"], event["key"]) for event, _ in strokes]
    assert kinds == [
        ("rawKeyDown", "Shift"),
        ("rawKeyDown", "P"),
        ("char", "P"),
        ("keyUp", "P"),
        ("keyUp", "Shift"),
        ("rawKeyDown", "Shift"),
        ("rawKeyDown", "!"),
        ("char", "!"),
        ("keyUp", "!"),
        ("keyUp", "Shift"),
    ]
    p = strokes[1][0]
    assert p["code"] == "KeyP" and p["modifiers"] == SHIFT
    bang = strokes[6][0]
    assert bang["code"] == "Digit1" and bang["windowsVirtualKeyCode"] == 49


def test_a_password_like_text_is_typed_whole_with_human_gaps() -> None:
    text = "Sp3c!al pa$$word_#2026 é"
    strokes = keystrokes(text, random.Random(7))
    assert _typed(strokes) == text
    # Between keys 40 to 140 ms, a key held 20 to 60 ms.
    gaps = [wait for event, wait in strokes if event["type"] == "keyUp" and wait]
    holds = [wait for event, wait in strokes if event["type"] == "char"]
    assert gaps and all(KEY_GAP[0] <= wait <= KEY_GAP[1] for wait in gaps)
    assert all(KEY_HOLD[0] <= wait <= KEY_HOLD[1] for wait in holds)
    # Each character of the US layout carries its code; é has none, as an
    # input method sends it.
    for event, _ in strokes:
        if event["type"] == "char" and event["text"] != "é":
            assert event["code"]
    accent = next(e for e, _ in strokes if e["type"] == "char" and e["text"] == "é")
    assert accent["code"] == "" and accent["windowsVirtualKeyCode"] == 0


def test_a_line_break_is_enter() -> None:
    strokes = keystrokes("\n", random.Random(0))
    assert [(e["type"], e["key"]) for e, _ in strokes] == [
        ("rawKeyDown", "Enter"),
        ("char", "Enter"),
        ("keyUp", "Enter"),
    ]
    assert strokes[1][0]["text"] == "\r"


def test_every_printable_ascii_character_has_a_key() -> None:
    for code in range(32, 127):
        assert chr(code) in human_input.LAYOUT


# --- the sign-in browser sends them ---------------------------------------------------------


class Recorder:
    """A DevTools connection that records what it is sent."""

    def __init__(self) -> None:
        self.sent: List[Tuple[str, Dict[str, Any]]] = []
        self.open = True

    def on(self, method: str, handler: Any) -> None:
        pass

    async def send(self, method: str, params: Optional[Dict[str, Any]] = None) -> Any:
        self.sent.append((method, params or {}))
        if method == "Runtime.evaluate":
            expression = (params or {}).get("expression", "")
            value: Any = (
                "complete"
                if expression == "document.readyState"
                else (
                    '{"url": "https://www.linkedin.com/login", "title": "LinkedIn Login", "text": ""}'
                )
            )
            return {"result": {"value": value}}
        return {}

    async def close(self) -> None:
        self.open = False


@pytest.fixture
def no_waiting(monkeypatch: pytest.MonkeyPatch) -> List[float]:
    waited: List[float] = []
    real_sleep = asyncio.sleep

    async def sleep(seconds: float) -> None:
        waited.append(seconds)
        await real_sleep(0)

    monkeypatch.setattr(browsers.asyncio, "sleep", sleep)
    return waited


def _browser(humane: bool) -> Tuple[ChromiumBrowser, Recorder]:
    connection = Recorder()
    browser = ChromiumBrowser(None, "", connection, True, None, humane)  # type: ignore[arg-type]
    browser._rng = random.Random(5)
    return browser, connection


def test_the_sign_in_browser_clicks_and_types_as_a_hand(
    no_waiting: List[float],
) -> None:
    browser, connection = _browser(humane=True)

    async def scenario() -> None:
        await browser.click_at(640.0, 300.0)
        await browser.click_at(640.0, 420.0)
        await browser.type_text("Me@x.io")

    asyncio.run(scenario())
    mouse = [p for m, p in connection.sent if m == "Input.dispatchMouseEvent"]
    kinds = [p["type"] for p in mouse]
    first_press = kinds.index("mousePressed")
    assert first_press >= 6 and set(kinds[:first_press]) == {"mouseMoved"}
    assert kinds[first_press + 1] == "mouseReleased"
    assert mouse[first_press]["x"] == 640.0 and mouse[first_press]["y"] == 300.0
    # The second travel starts where the first click was.
    second = kinds.index("mousePressed", first_press + 1)
    second_moves = mouse[first_press + 2 : second]
    assert second_moves and all(p["type"] == "mouseMoved" for p in second_moves)
    assert abs(second_moves[0]["x"] - 640.0) < 10
    assert 300.0 <= second_moves[0]["y"] <= 330.0
    # Typing is keys, never inserted text.
    keys = [p for m, p in connection.sent if m == "Input.dispatchKeyEvent"]
    assert "".join(k["text"] for k in keys if k["type"] == "char") == "Me@x.io"
    assert not [m for m, _ in connection.sent if m == "Input.insertText"]
    # And it took its time.
    assert sum(no_waiting) > 0.5


def test_the_computer_browser_still_clicks_and_types_at_once(
    no_waiting: List[float],
) -> None:
    browser, connection = _browser(humane=False)

    async def scenario() -> None:
        await browser.click_at(10.0, 20.0)
        await browser.type_text("loop")

    asyncio.run(scenario())
    mouse = [p["type"] for m, p in connection.sent if m == "Input.dispatchMouseEvent"]
    assert mouse == ["mouseMoved", "mousePressed", "mouseReleased"]
    assert ("Input.insertText", {"text": "loop"}) in connection.sent
