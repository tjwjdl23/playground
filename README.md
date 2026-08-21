# Portfolio blog

Personal portfolio blog — learning log, essays, projects, and notes.
Built with [Astro](https://astro.build), deployed to GitHub Pages.

- **Live site:** https://tjwjdl23.github.io/playground/
- **Writing guide:** see [WRITING.md](./WRITING.md)

## Development

```sh
npm install
npm run dev      # drafts visible at http://localhost:4321/playground/
npm run build    # production build (drafts excluded)
```

## Excel editor

`public/excel-editor.html` is a standalone tool: open an `.xlsx`/`.xlsm` file,
edit cells in the browser, and hit **Save** to write straight back to the same
file — no re-picking, no download-and-overwrite. Untouched parts of the workbook
are repacked byte-for-byte, so formatting, formulas and charts survive.

Open it at `/playground/excel-editor.html`. Details (Korean): [docs/excel-editor.md](./docs/excel-editor.md).

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the
site and deploys it to GitHub Pages.

One-time setup: in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions**.
