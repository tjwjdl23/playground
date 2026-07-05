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

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the
site and deploys it to GitHub Pages.

One-time setup: in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions**.
