# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Every status word ever written maps, and "finished" is answered once.

The set below is what the `evals` collection has held: the UI, the runner,
the online path and older code each had their own words. A poller that
misses one of them polls forever, which is what happened before this module
existed. The CLI's `runs watch`, the action and the SDK all ask here.
"""

from agent_runtimes.evals import status
from agent_runtimes.evals.remote import evals as remote_evals

OBSERVED_RUN_WORDS = [
    "queued",
    "init",
    "pending",
    "running",
    "completed",
    "failed",
    "error",
    "cancelled",
    "success",
    "succeeded",
    "passed",
    "done",
    "",
]


def test_every_observed_run_word_maps_into_the_vocabulary():
    for word in OBSERVED_RUN_WORDS:
        assert status.normalize_run_status(word) in status.RUN_STATUSES, word


def test_the_finished_words_are_finished_and_the_others_are_not():
    for word in ("completed", "success", "succeeded", "passed", "done", "failed", "error", "cancelled", "canceled"):
        assert status.is_terminal_run_status(word), word
    for word in ("queued", "init", "pending", "running", "scoring", "provisioning", "review", "blocked", ""):
        assert not status.is_terminal_run_status(word), word


def test_case_words_map_too():
    assert status.normalize_case_status("pass") == "passed"
    assert status.normalize_case_status("skipped") == "cancelled"
    assert status.normalize_case_status("") == "waiting"
    assert status.is_terminal_case_status("failed")
    assert not status.is_terminal_case_status("scoring")


def test_an_unknown_word_is_shown_as_itself():
    assert status.normalize_run_status("Exploding") == "exploding"
    assert not status.is_terminal_run_status("exploding")


def test_the_watchers_use_this_vocabulary():
    # The SDK's poller must agree with the module rather than keep a set.
    assert remote_evals.is_terminal_run_status("done")
    assert not remote_evals.is_terminal_run_status("pending")
