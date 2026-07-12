# Writing guide

How to write and publish posts on this blog.

There are three ways to write, from most to least convenient:

1. **Pages CMS** (browser editor) — see [Writing from the browser](#writing-from-the-browser-pages-cms)
2. **GitHub web editor** — see [Editing on GitHub](#editing-on-githubcom)
3. **Locally** — the workflow below

## Writing from the browser (Pages CMS)

One-time setup:

1. Go to **https://app.pagescms.org** and sign in with your GitHub account.
2. Grant it access to the `tjwjdl23/playground` repository.
3. Open the repo in Pages CMS — the editor reads `.pages.yml` at the repo
   root and shows a section-by-section post editor automatically.

Day to day: open app.pagescms.org (bookmark it), pick a section, click
**Add entry**, write, save. Saving commits straight to `main`, which
auto-deploys the site in ~1–2 minutes. New posts default to
**Draft = on**, so nothing goes public until you uncheck it and save.
Images uploaded in the editor land in `public/images/` with the correct
URL prefix.

## Editing on github.com

No setup needed:

- **Edit an existing post:** browse to the file on github.com and press
  the pencil icon — or press `.` anywhere in the repo to open the full
  VS Code web editor (github.dev).
- **New post:** open the section folder, e.g.
  [`src/content/posts/log`](https://github.com/tjwjdl23/playground/tree/main/src/content/posts/log),
  then **Add file → Create new file**. Paste the frontmatter template
  below, write, and commit to `main`.

## Creating a new post

1. Add a Markdown file under `src/content/posts/<section>/`, where
   `<section>` is one of `log`, `essays`, `projects`, `notes`.
   The filename becomes the URL slug: `src/content/posts/log/my-post.md`
   → `/log/my-post/`. Use lowercase-with-hyphens filenames.
2. Start the file with frontmatter (see below).
3. Preview locally with `npm run dev` (http://localhost:4321/playground/).
   Drafts are visible in dev mode.
4. Commit and push to `main`. GitHub Actions builds and deploys automatically.

`.mdx` files also work if you need components inside a post.

## Frontmatter fields

```yaml
---
title: '포스트 제목'
date: 2026-07-05
section: log          # log | essays | projects | notes
tags: [python, healthcare]
draft: true           # true = local-only; false = published
lang: ko              # ko | en — set per post
description: 'One-line summary, shown on list pages and in link previews.'
---
```

- `title`, `date`, `section`, `description` are required.
- `draft` defaults to `true` if omitted — new posts are private by default.
- `lang` defaults to `ko`.

## Drafts and publishing

- `draft: true` posts exist only in local dev (`npm run dev`). They are
  completely excluded from the production build: no page, no RSS entry,
  no sitemap entry, and the section won't appear in the nav if it has no
  published posts.
- To publish: change to `draft: false`, commit, push. That's it.
- Drafts show an orange "draft" badge in local dev so you can tell them apart.

## Adding images

1. Put image files in `public/images/<post-slug>/`, e.g.
   `public/images/my-post/screenshot.png`.
2. Reference them with the site base path included:

   ```md
   ![Alt text describing the image](/playground/images/my-post/screenshot.png)
   ```

   (The `/playground` prefix is required because the site is served from
   https://tjwjdl23.github.io/playground/.)

For project posts, you can also embed a live demo:

```html
<iframe src="https://your-demo-url" title="Demo" loading="lazy"></iframe>
```

Iframes and images are styled to be responsive automatically.

## Useful commands

| Command           | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Local dev server with drafts visible           |
| `npm run build`   | Production build into `dist/` (drafts excluded)|
| `npm run preview` | Serve the production build locally             |

## Site-wide settings

- Site title/description and section names: `src/consts.ts`
- Home page intro: `src/pages/index.astro`
- About page: `src/pages/about.astro`
- Deployment URL/base path: `astro.config.mjs` (`site` and `base`)
