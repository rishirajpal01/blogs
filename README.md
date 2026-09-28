# Rishi / notes

This repository contains the source for [Rishi / notes](https://blogs.rishirajpal.com), a technical blog built with Astro. Posts are Markdown files; Astro turns them into static pages and an RSS feed.

## Repository structure

| Path | Contents |
| --- | --- |
| `src/content/blog/` | Blog posts in Markdown. |
| `src/content.config.ts` | The blog collection schema. |
| `src/pages/` | The homepage, article pages, About page, architecture page, and RSS feed. |
| `src/lib/posts.ts` | Shared post filtering, ordering, dates, and URLs. |
| `src/layouts/` and `src/styles/` | Shared page layout and site styles. |
| `public/` | Static assets, including Canvas screenshots and the standalone architecture map. |
| `.archify/` and `docs/architecture.md` | Architecture map source and repository architecture notes. |

The homepage, article pages, and RSS feed read from the same Astro content collection. The `/arch/` page embeds `public/arch-map.html`; the map's source and supporting notes are kept in this repository.
