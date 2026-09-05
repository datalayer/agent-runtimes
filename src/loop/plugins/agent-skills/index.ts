/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-skills` — the capacity, as a plugin.
 *
 * Mounts the `example-skills` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * @module loop/plugins/agent-skills
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_SKILLS_PLUGIN_NAME = '@datalayer/loop-plugin-agent-skills';

export const AgentSkillsPlugin = defineAgentCapacityPlugin({
  key: 'skills',
  displayName: 'Agent Skills',
  description: 'Agent Skills',
  specId: 'example-skills',
  octicon: 'mortar-board',
  emoji: '🎓',
  suggestions: [
    {
      text: 'List available skills',
      message: 'List all your available skills and what they can do.',
    },
    {
      text: '👤 Who am I',
      message:
        'Use the datalayer-whoami skill to tell me who I am, including my user identity and available context.',
    },
    {
      text: '🌐 Crawl a webpage',
      message:
        'Use the crawl skill to fetch the content of https://datalayer.ai and summarize it.',
    },
    {
      text: '📅 Generate an event',
      message:
        'Use the events skill to create a new event named "team-sync" with status "pending" and describe it.',
    },
    {
      text: '🐙 GitHub repos',
      message:
        'Use the GitHub skill to show two sections: first, the top 3 recently updated public repositories from the datalayer organization; second, my top 3 recently updated private repositories. Keep the output clear and concise.',
    },
    {
      text: '📄 Read a PDF',
      message:
        'Use the PDF skill to extract the text from a PDF file at /tmp/sample.pdf and show me the first 200 characters.',
    },
    {
      text: '📝 Summarize text',
      message:
        'Use the text summarizer skill to summarize the following: "Artificial intelligence has transformed many industries. Machine learning enables computers to learn from data. Natural language processing allows machines to understand human language. Computer vision gives machines the ability to interpret images. These technologies are reshaping healthcare, finance, education, and transportation."',
    },
    {
      text: '😄 Tell me a joke',
      message: 'Use the jokes skill to tell me a random joke.',
    },
  ],
});

export default AgentSkillsPlugin;
