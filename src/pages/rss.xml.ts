import type { APIRoute } from 'astro';
import { getPublishedPosts, postUrl } from '../lib/posts';

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character] ?? character);
}

export const GET: APIRoute = async ({ site }) => {
  const posts = await getPublishedPosts();
  const base = site ?? new URL('https://blogs.rishirajpal.com');
  const items = posts.map((post) => `
    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${new URL(postUrl(post.id), base)}</link>
      <guid>${new URL(postUrl(post.id), base)}</guid>
      <pubDate>${post.data.publishedAt.toUTCString()}</pubDate>
      <description>${escapeXml(post.data.description)}</description>
    </item>`).join('');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0"><channel>
    <title>Rishi / notes</title>
    <link>${base}</link>
    <description>Technical notes on software engineering and systems.</description>${items}
  </channel></rss>`, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
