# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Desk & Sales: a scene and its stage written in Python (LOOP P-30).

    loop scenes rehearse scene.py                 # played here, beat by beat
    loop scenes build scene.py --out scene.yaml   # the scene spec, loop.scene/v1
    loop scenes push scene.py --space <space id>  # kept in your Space: the Studio opens it

Two applications of the catalogue: the support desk takes the audience's
question and asks Sales, over A2A, which answers.
"""

from agent_runtimes import loop

scene = loop.scene(
    "desk-and-sales",
    "Desk & Sales",
    emoji="🎬",
    description="The support desk takes a question about selling and asks Sales.",
    entry="desk",
    tags=["example", "scene", "python"],
)

# The cast: two applications of the catalogue, one asking the other.
scene.player(
    "desk",
    app="support-desk",
    role="initiator",
    talks_to=["sales"],
    name="Desk",
    line="I take your question and ask Sales.",
    brief=(
        "Ask Sales whatever the audience asks about selling, in one request, "
        "and report what it answers without adding to it. Do not question the "
        "audience first: nobody is there to answer you back."
    ),
)
scene.player(
    "sales",
    app="sales",
    name="Sales",
    line="I know how a pipeline is run.",
    brief="Answer the desk in two sentences at most, in plain words.",
)
scene.setting(
    language="en",
    assumes="Two agents over A2A: the desk asks, Sales answers.",
)

# The script: one beat, and the shape its transcript must take.
beat = scene.beat(
    "pipeline",
    say="Ask Sales what a sales pipeline is, in one sentence.",
    expect="The desk asks Sales, and reports its sentence on the pipeline.",
    narration="The desk asks Sales.",
)
beat.asks("desk", "sales", what="what a sales pipeline is")
beat.answers("sales", "words", what="a sentence on the pipeline")
beat.answers("desk", "words", what="what Sales answered")
beat.rehearse(
    "You → Desk",
    "Desk → Sales",
    "Desk: words",
    must_say=["pipeline"],
    must_not_say=["I cannot"],
    within="3m",
)

# The stage: where each plays, where each stands, who may watch. Both play in
# the browser, so the scene is rehearsed on this machine; put Sales on a
# runtime ("runtime") to play it on Datalayer with --cloud.
loop.stage(
    scene,
    runs_in={"desk": "browser", "sales": "browser"},
    positions={"desk": (0.25, 0.5), "sales": (0.75, 0.5)},
    opens_first="desk",
    inspectors=["agent", "a2a"],
)
