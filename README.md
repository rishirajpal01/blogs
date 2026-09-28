# Rishi / notes

Minimal technical blog for `blogs.rishirajpal.com`, built with Astro and Markdown.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL Astro prints (normally `http://localhost:4321`). To check the static output, run `npm run build` and `npm run preview`.

## Write a post

Add a Markdown file under `src/content/blog/`. The filename becomes the URL (`my-post.md` → `/blog/my-post/`). Use frontmatter like this:

```md
---
title: My post title
description: A short summary for the homepage and search previews.
publishedAt: 2026-09-28
tags: [Architecture]
draft: false
---

Your post starts here.
```

`draft: true` keeps a post out of the homepage, RSS feed, and generated pages. `updatedAt` is optional. The first published post is `src/content/blog/building-canvas.md`.

## Deployment

The project generates a static `dist/` directory with canonical URLs on `https://blogs.rishirajpal.com`. Cloudflare deployment uses the checked-in `wrangler.jsonc` configuration:

```sh
npm run check
npm run build
npx wrangler deploy
```
