# How this repository works

The interactive [Archify map](https://blogs.rishirajpal.com/arch/) describes this blog at commit `186340fd22724bf5beb373fcb668829d0a6ac388`. Its editable source is [`candidate.json`](../.archify/architecture-blog-system-20260929-011819/candidate.json), and the published, self-contained document is [`arch-map.html`](../public/arch-map.html).

## Publishing path

1. Posts live as Markdown in `src/content/blog/`. Their frontmatter is validated by the collection schema in `src/content.config.ts`.
2. `src/lib/posts.ts` excludes drafts and sorts published posts by date. The index uses that list; `src/pages/blog/[id].astro` generates one static page per published post.
3. `src/pages/rss.xml.ts` generates RSS from the same published list. `src/layouts/BaseLayout.astro` supplies shared navigation, metadata, and the footer.
4. Astro builds static files into `dist/`. The site also has About, architecture, and 404 routes.

## Deployment path

Cloudflare Workers Builds watches the GitHub `main` branch. On a push, it runs `npm run build`, then `npx wrangler deploy`. `wrangler.jsonc` publishes `dist/` as static assets on `blogs.rishirajpal.com`.

## Refreshing the map

Install the [Archify skill](https://github.com/tt-a1i/archify) if needed. Update the diagram's repository revision and source line references in `candidate.json`, then run its `finalize architecture` command with `--repo-root` and `--quality showcase`. Copy the validated HTML to `public/arch-map.html`. Run `npm run check` and `npm run build` before publishing. The diagram records a source snapshot; it does not update automatically with every post.
