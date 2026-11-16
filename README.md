# New-Tools

Daily Uses Tool.

| Folder | What it is |
|---|---|
| `pdf-editor/` | The PDF editor (React + Vite). Runs on its own, with no server or database. |
| `toolyverse/` | The website (Next.js) with 24 tools. It embeds the editor and imports code shared with it from `pdf-editor/src` through the `@editor/*` alias. |

Run everything from this folder:

```bash
npm run install:all
```

```bash
npm run editor
```

`npm run editor` starts the editor alone at http://localhost:5173. To run the website at
http://localhost:3000 (it builds the editor into it first):

```bash
npm run site
```

`npm test`, `npm run typecheck` and `npm run build` run for both projects.
Each project's own README has the details.
