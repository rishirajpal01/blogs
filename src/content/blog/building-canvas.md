---
title: 'Building Canvas: Collaborative Pixel Art on Cloudflare'
description: 'A tour of Canvas and the decisions behind its shared boards, artwork generators, live updates, and board lifecycles.'
publishedAt: 2026-09-29
tags: [Projects, Cloudflare, Architecture]
---

I built [Canvas](https://canvas.rishirajpal.com) so people could draw on the same pixel board and see each other’s changes live. You choose a board, pick a color, and paint. Some boards start as blank spaces; others have their own character. Pixel Garden has a winding path and vegetation, Tiny Town has roads and buildings, Night Sky invites people to add stars, and Kaleidoscope turns drawing into a symmetric pattern. There are also custom boards, a Daily Mosaic, and tools that generate or gradually reveal artwork.

That simple interaction made the engineering interesting. Several people can paint at once, a generator can replace the whole image, and a fill can still be running when somebody switches boards or closes a tab. I had to decide where shared state lives, how to reject outdated changes, and how long temporary artwork should remain available.

<figure class="article-figure">
  <a href="/images/canvas/night-sky.jpg"><img src="/images/canvas/night-sky.jpg" alt="Canvas running in a browser with the Night Sky board, its star-filled artwork, drawing tools, and board navigation" width="1512" height="1092" decoding="async" /></a>
  <figcaption>Night Sky on the live Canvas site. Screenshot from the <a href="https://github.com/rishirajpal01/canvas#screenshots">Canvas README</a>, captured 27 September 2026; shared artwork can change.</figcaption>
</figure>

## One owner for each shared board

The first challenge was keeping every visitor on a board in sync. A new visitor needs the current image, then a stream of later changes. I considered an always-on application server with a database and Redis pub/sub. That is a familiar approach, but it adds services to operate and requires synchronization between server processes. Having browsers poll a database would simplify connections, but frequent polling wastes requests and slower polling makes collaboration feel delayed.

Production instead runs on Cloudflare Pages, Pages Functions, a private Worker, and SQLite-backed Durable Objects. Pages serves the interface. A Pages Function forwards API requests to the Worker. A catalogue Durable Object manages board metadata, while each board ID maps to its own board Durable Object. That object owns the pixels, the board’s generation number, and its live WebSocket connections.

When somebody connects, the board sends a complete snapshot. After that, it broadcasts individual pixel changes or batches. Giving each board one logical owner means the state and its live connections meet in the same place; I do not need a separate pub/sub layer to coordinate several application servers. I also keep a disk-backed Go server that serves the same browser assets locally, using server-sent events for updates.

## Representing pixels and rejecting stale changes

A standard board is 200 × 200 pixels: 40,000 cells. Individual edits need to be cheap to locate, but the app also generates shapes and replaces entire boards. A database row per pixel would make a single write small while turning a snapshot into thousands of records. A sparse map would suit an almost empty board, but generated artwork can fill much of it. I chose a one-dimensional array, with `pixelId = y * width + x`. Each value is a palette index: 0 is blank, 1–16 are colors, and -1 marks a blocked cell outside a shape. Custom photo boards can vary in size, within the app’s cell and dimension limits.

The board object persists a complete JSON snapshot in one SQLite row. The browser draws a full snapshot with one `ImageData` operation, then updates only affected pixels as events arrive. This model is easy to inspect and validate, though rewriting a complete state has a cost on a busy board.

The more subtle problem is an old request arriving after the image changes. Imagine somebody starting a long live fill while another person clears the board. Canceling the fill in one browser would not guarantee that delayed requests from every client stop. So full-board replacements advance a generation number. Paint requests and live-fill batches carry the generation they started with; the board rejects stale ones with `HTTP 409`. The client reloads the current artwork before continuing. Conflict detection happens where the shared state lives.

## Generating artwork without flooding the network

Canvas has two fill modes. Auto Fill replaces a board with a new design at once. Auto Fill Live clears the visible board, then reveals the design pixel by pixel. Sending one request per pixel would be straightforward, but a full standard board could mean 40,000 requests. Sending the entire design in one request would save network work but make the shared image appear instantly for everyone, losing the live reveal.

I separated delivery from presentation. The client sends up to 64 pixel events in a batch; the board validates, stores, and broadcasts each batch. A visible browser can still reveal pixels one at a time. A hypothetical fill of all 40,000 cells needs 625 batches instead of 40,000 individual requests. That is a reduction in request count, not a measured 64× speedup: network latency, storage writes, and the intentional animation still matter.

Each generator gives the boards a different starting point. Pixel Garden draws varied paths and vegetation. Tiny Town builds roads, hills, and buildings. Night Sky combines a horizon and dense stars.

<figure class="article-figure">
  <a href="/images/canvas/pixel-garden.jpg"><img src="/images/canvas/pixel-garden.jpg" alt="Canvas Pixel Garden board showing a winding path bordered by flowers and greenery" width="1512" height="1092" loading="lazy" decoding="async" /></a>
  <figcaption>Pixel Garden’s generated path and vegetation.</figcaption>
</figure>

<figure class="article-figure">
  <a href="/images/canvas/tiny-town.jpg"><img src="/images/canvas/tiny-town.jpg" alt="Canvas Tiny Town board showing a road, buildings, and a mountain landscape" width="1512" height="1092" loading="lazy" decoding="async" /></a>
  <figcaption>Tiny Town’s road and landscape.</figcaption>
</figure>

Kaleidoscope has a stricter visual rule: randomness must never break symmetry. Its generator varies rings, spokes, phase, and colors while deriving the pattern from mirrored coordinates. During a live fill, each batch completes mirrored pixel groups together so the pattern remains balanced as it appears.

<figure class="article-figure">
  <a href="/images/canvas/kaleidoscope.jpg"><img src="/images/canvas/kaleidoscope.jpg" alt="Canvas Kaleidoscope board displaying a colorful symmetric circular pixel-art pattern" width="1512" height="1092" loading="lazy" decoding="async" /></a>
  <figcaption>A completed symmetric Kaleidoscope pattern.</figcaption>
</figure>

## Keeping fills moving when the browser does not

An early live-fill version waited for each batch’s on-screen animation before sending the next one. Browsers throttle timers in background tabs, so switching away slowed both the reveal and the network job. A Web Worker could handle some background work, but rendering still belongs to the page and another worker would add coordination. Revealing more pixels per tick would also weaken the deliberate one-pixel-at-a-time effect.

The reveal queue now responds to page visibility. While the tab is visible, it draws pixels individually. When hidden, it flushes pending pixels so throttled timers do not hold up the next batch. Fill jobs are keyed by board ID, allowing one to continue on its starting board while the visitor looks at another.

Navigation follows the same principle of keeping unrelated work from interfering. Sidebar links update browser history without a full page reload. The client caches the board directory, fetches the selected board’s map and target in parallel, and uses a load token to discard responses from older navigations. A slow response can no longer paint the wrong board after a rapid switch. I have not published navigation benchmarks; the concrete gains are fewer avoidable reloads and fills that continue across tab and board changes.

## Letting temporary boards expire

Collaboration is more useful when visitors can create their own spaces, but keeping every board forever would make storage grow without bound. Manual cleanup would depend on somebody remembering to run it. Deleting every temporary board at midnight would cut short a board created late in the day.

Custom boards therefore remain editable for exactly 168 hours after creation. Daily Mosaic rotates at midnight in Asia/Kolkata; today and the previous six India dates remain available, with older mosaics read only until they expire. Built-in boards stay available. The catalogue prunes expired metadata during normal access and schedules alarms, while board objects use alarms to remove their stored state.

<figure class="article-figure">
  <a href="/images/canvas/daily-mosaic.jpg"><img src="/images/canvas/daily-mosaic.jpg" alt="Canvas Daily Mosaic board with colorful abstract pixel art and date-based board navigation" width="1512" height="1194" loading="lazy" decoding="async" /></a>
  <figcaption>A Daily Mosaic board, which rotates at midnight in Asia/Kolkata.</figcaption>
</figure>

Custom boards also support photo recreation. The browser scales an image and maps its pixels to the shared 16-color palette locally. The original file is not uploaded; the server receives the palette representation needed to build the board. It uses the same pixel model as every other board without storing somebody’s original photo.

## Shipping the pieces together

The frontend, routing layer, and stateful API need compatible releases, while board data must survive those releases. Manual uploads could work for a demo, but they make it easy to publish mismatched Pages assets and Worker code. Returning to one always-on server would simplify the release command while bringing back a process to manage.

Every push to `main` instead triggers GitHub Actions. The workflow runs Go tests and vet, browser and Worker tests, builds the Pages assets, then deploys the private Worker followed by Pages. Durable Object storage persists across code deployments. I also published an [interactive architecture viewer](https://canvas.rishirajpal.com/arch) for exploring the request, pixel, and release flows.

## What I would revisit

Canvas reinforced a lesson for me: real-time behavior starts with a clear state model. Board ownership, generation checks, bounded lifetimes, and separate network and animation pacing solved more problems than the choice of WebSockets alone.

The main trade-off I would revisit at a larger scale is persisting the full JSON cell array after mutations. It is simple to reason about, but a very busy board could amplify writes. I would benchmark sparse deltas or a compact binary format before changing it. For now, the current design let me prioritize correctness and build a working product whose decisions are visible in the [source code](https://github.com/rishirajpal01/canvas).
