# Writing guide

How to write and publish posts on this blog.

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
