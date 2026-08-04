# Diagrams — how they work

The architecture diagrams are authored as **Mermaid** (`.mmd`) and shipped in two forms:

| File | Purpose |
|------|---------|
| `*.mmd` | The **source** (Mermaid). Renders natively on GitHub, in VS Code (Mermaid extension), and at mermaid.live. This is what you edit. |
| `*.html` | A **self-contained viewer** with the diagram **pre-rendered to a static inline SVG**. It needs **no internet** and **no JavaScript** — it opens correctly on an air-gapped VM, unlike a CDN-based renderer. |

Diagrams in this folder:

- `architecture-diagram` — system / container view
- `data-model` — whole-application ERD (every table)
- `deployment-diagram` — deployment / infrastructure topology
- `request-sequence` — end-to-end request flow

> **Why static SVG?** The earlier `.html` files loaded Mermaid from a public CDN
> (`cdn.jsdelivr.net`). On a network without outbound internet that fetch fails and
> the page is blank. Pre-rendering to an inline SVG removes the dependency entirely.

## Editing a diagram

1. Edit the `.mmd` file (Mermaid syntax). Preview it on GitHub or in VS Code.
2. Re-render the matching `.html` so its embedded SVG matches. Any Mermaid renderer works; e.g. with the Mermaid CLI:
   ```bash
   npx -y @mermaid-js/mermaid-cli -i docs/architecture-diagram.mmd -o /tmp/out.svg
   # then paste the SVG into docs/architecture-diagram.html in place of the <div class="diagram">…</div>
   ```
   or open the `.mmd` at https://mermaid.live, export SVG, and replace the inline SVG in the `.html`.

## Mermaid gotchas (kept the syntax clean here)

- In **sequence diagrams**, `;` is a statement separator — don't put it inside a
  message label (use a comma). Avoid a lone `%` in labels too.
- Keep `%%` comments on their own lines.
