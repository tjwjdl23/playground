---
title: 'Hello, world: how this blog works'
date: 2026-07-05
section: log
tags: [meta]
draft: false
lang: en
description: 'A quick tour of how this site is built and how the draft system works.'
---

This is the first published post, and it doubles as a test that the whole
pipeline works: Markdown in, static site out, deployed by GitHub Actions on
every push to `main`.

A few things about how this site works:

- Posts are plain Markdown files in `src/content/posts/`, one folder per
  section.
- Every post has a `draft` flag. Drafts are visible when I run the site
  locally, but they are completely excluded from the deployed site — no page,
  no RSS entry, no sitemap entry.
- The navigation only shows sections that have at least one published post,
  so empty sections never appear.

If you can read this, the deploy worked.
