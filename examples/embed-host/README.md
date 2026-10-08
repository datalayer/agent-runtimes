# A host page for the embed

A plain page on an origin of its own that embeds a Datalayer application with
one script tag and one `<datalayer-app>` element (STUDIO D-07, D-08, D-10):
the page passes its `context`, offers one function (`open_ticket`) and logs
every event the element raises (`message`, `action`, `decision`,
`token-expired`, `window-message`).

Serve it on a port of its own, so that the embed bundle is fetched across
origins as a real host fetches it:

```bash
python3 -m http.server 8788 --directory examples/embed-host
```

Then open <http://127.0.0.1:8788/>. The page reads what to embed from its
query, each with a default:

| Query    | Default                                         | What it is                                                   |
| -------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `embed`  | `http://localhost:3063/embed/datalayer-app.js`  | The script a host writes, where the bundle is served         |
| `origin` | `http://localhost:3063`                         | Where Datalayer is (the landing)                             |
| `api`    | `https://r1.datalayer.run`                      | Datalayer's services: ai-agents, ai-inference                |
| `app`    | `web-research`                                  | A public example, an application's address, or a decision's id |
| `mode`   | `inline`                                        | `inline`, `bubble`, `panel` or `assistant`                   |
| `token`  | —                                               | An embed token, for a private application                    |
| `server` | —                                               | An agent-runtimes server of the host's own                   |

Without a token, a public application runs for the visitor as it does on
Datalayer's pages: the element reads what it is (an example the visitors'
runtime keeps warm, or an address its owner opened to visitors), mints a
visitor's token from ai-inference and talks to the visitors' runtime. A
private application, or one a visitor may not talk to, says so in place and
names the embed token as what it takes.

The function the page offers is called only by an application whose Appspec
names it under `deployment.embedded.host.functions`, as the rule naming
`host_open_ticket` decides; `web-research` names none, so with it the page's
`context` and `functions` are offered and never asked for. The end-to-end
suite in `e2e/` drives this page as one of its two mounts.
