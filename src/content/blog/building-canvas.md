---
title: 'Building Canvas: Collaborative Pixel Art on Cloudflare'
description: 'How I built Canvas with Cloudflare, Durable Objects, real-time updates, and deliberate trade-offs in data modeling and browser performance.'
publishedAt: 2026-09-29
tags: [Projects, Cloudflare, Architecture]
---

I built [Canvas](https://canvas.rishirajpal.com) as a collaborative pixel art app where people can open the same board and watch each other’s changes appear live. It started as a local Go server, but the most interesting engineering work came when I moved production to Cloudflare and added more than a blank grid: a symmetric Kaleidoscope, themed artwork generators, daily mosaics, custom boards, photo recreation, and two modes of automatic filling.

The result is playful. The system underneath had to answer less playful questions. Who owns a board’s state? What happens when two people paint while someone replaces the entire image? How do I stream thousands of updates without making the browser or network do unnecessary work? And how do I keep temporary boards from accumulating forever?

<figure class="article-figure">
  <a href="/images/canvas/night-sky.jpg"><img src="/images/canvas/night-sky.jpg" alt="Canvas running in a browser with the Night Sky board, its star-filled artwork, drawing tools, and board navigation" width="1512" height="1092" decoding="async" /></a>
  <figcaption>Night Sky on the live Canvas site. Screenshot from the <a href="https://github.com/rishirajpal01/canvas#screenshots">Canvas README</a>, captured 27 September 2026; shared artwork can change.</figcaption>
</figure>

## From a Go server to Cloudflare

Production runs on Cloudflare Pages, Pages Functions, a private Worker, and SQLite-backed Durable Objects. Pages serves the HTML, CSS, and JavaScript. A Pages Function forwards API requests to the Worker. The Worker uses a catalogue Durable Object for board metadata and routes each board ID to its own board Durable Object.

That last choice simplified the concurrency model. Each board has one logical owner for its pixels, generation, and live WebSocket connections. I did not need a Redis pub/sub layer to synchronize several application servers. A new client gets a full snapshot when it connects; after that, the board broadcasts individual pixel changes or small batches. The catalogue handles names, dates, and expiry, while the board object handles artwork. Keeping those responsibilities separate makes the routing and lifecycle rules easier to follow.

I still keep a disk-backed Go server for local development. It serves the same browser assets and exposes the same core board operations, but uses server-sent events rather than production WebSockets. I removed an older Redis/MongoDB service and its dependencies, leaving a smaller production architecture and a useful local development path.

## The board as data

A standard board is 200 by 200 pixels, or 40,000 cells. I represent it as a one-dimensional array: `pixelId = y * width + x`. Each cell holds a palette index: 0 is blank, 1 through 16 are colors, and -1 marks a blocked pixel outside a shape. This representation makes drawing, serialization, batching, and shape validation straightforward. Custom photo boards can change dimensions, subject to a 40,000-cell and 512-pixel-per-side limit.

The board Durable Object currently persists a JSON snapshot in one SQLite row. That is a deliberately simple model: a board is loaded as a complete state object, and an update is easy to validate and save. The browser maintains its own copy of the cell array. It draws a full snapshot through one `ImageData` operation, then uses targeted canvas updates for incoming pixel events rather than rebuilding the entire image for every click.

The harder problem is a stale client. Imagine one person starting a long live fill while another clears the board. Without coordination, delayed fill batches could repaint the new board. Every board therefore has a generation number. Operations that replace the board advance it; paint requests carry the generation they started from. A stale request receives `HTTP 409`, and the client reloads the latest artwork before continuing. That small piece of protocol state prevents an entire class of accidental overwrites.

## Generating and streaming artwork

Auto Fill generates a fresh design and replaces the board in one operation. Auto Fill Live creates a target design, clears the visible board, and reveals it pixel by pixel. The generators are theme-aware: Pixel Garden draws a winding path and vegetation, Tiny Town builds a road and landscape, and Night Sky combines a dark horizon, stars, and a dithered Milky Way. Daily Mosaic chooses among several abstract styles.

<figure class="article-figure">
  <a href="/images/canvas/pixel-garden.jpg"><img src="/images/canvas/pixel-garden.jpg" alt="Canvas Pixel Garden board showing a winding path bordered by flowers and greenery" width="1512" height="1092" loading="lazy" decoding="async" /></a>
  <figcaption>Pixel Garden’s generated path and vegetation.</figcaption>
</figure>

<figure class="article-figure">
  <a href="/images/canvas/tiny-town.jpg"><img src="/images/canvas/tiny-town.jpg" alt="Canvas Tiny Town board showing a road, buildings, and a mountain landscape" width="1512" height="1092" loading="lazy" decoding="async" /></a>
  <figcaption>Tiny Town’s road and landscape.</figcaption>
</figure>

Kaleidoscope is different. Its generator varies rings, spokes, phase, and color schemes while deriving the pattern from mirrored coordinates. Random input changes the design, but the result remains symmetric. Live filling groups mirrored pixel orbits so one batch never leaves the pattern visibly half-finished.

<figure class="article-figure">
  <a href="/images/canvas/kaleidoscope.jpg"><img src="/images/canvas/kaleidoscope.jpg" alt="Canvas Kaleidoscope board displaying a colorful symmetric circular pixel-art pattern" width="1512" height="1092" loading="lazy" decoding="async" /></a>
  <figcaption>A completed symmetric Kaleidoscope pattern.</figcaption>
</figure>

Sending one HTTP request per pixel would be wasteful. The live-fill client groups events into batches of at most 64, and the server validates and broadcasts each batch. For a non-Kaleidoscope fill covering all 40,000 cells, that changes the request count from 40,000 theoretical single-pixel calls to 625 batches. This is a reduction in request count, not a claim that the feature is 64 times faster end to end. Network latency, storage writes, and the intentional reveal animation still matter.

## Keeping the browser responsive

The animation exposed another browser behavior: background tabs throttle timers. Originally, leaving the tab could make live fill crawl because the client waited for each pixel’s visual reveal before sending the next batch. I changed the reveal queue to flush when the document becomes hidden. The network job can continue while the tab is away, and the canvas catches up when the user returns. Fill jobs are keyed by board ID, so switching to another board does not silently cancel the original board’s work. On the visible board, the queue still reveals pixels one at a time.

Navigation received similar attention. Sidebar links update browser history and load the next board without a full document reload. The client caches the board directory, fetches the selected board’s map and target in parallel, and discards responses from an older navigation using a load token. These choices remove avoidable page setup and prevent a slow response from painting the wrong board after a rapid switch.

## Board lifecycles and deployment

Collaboration is more interesting when users can create their own spaces, but unlimited board creation would make storage grow without bound. Custom boards expire exactly 168 hours after creation. Daily Mosaic rotates at midnight in Asia/Kolkata; today and the six previous India dates remain available, with older dates read only. The catalogue prunes expired metadata during normal access and uses alarms for scheduled cleanup. Board objects also have expiry alarms for their stored state. Built-in boards remain available.

<figure class="article-figure">
  <a href="/images/canvas/daily-mosaic.jpg"><img src="/images/canvas/daily-mosaic.jpg" alt="Canvas Daily Mosaic board with colorful abstract pixel art and date-based board navigation" width="1512" height="1194" loading="lazy" decoding="async" /></a>
  <figcaption>A Daily Mosaic board, which rotates at midnight in Asia/Kolkata.</figcaption>
</figure>

Photo recreation is limited to custom boards. The browser reads the image, scales it to the allowed dimensions, and maps its pixels to the 16-color palette locally. The original file is not uploaded; the server receives the palette target needed to build the shared artwork. That keeps the data model consistent with every other board and avoids storing original photos.

Every push to main triggers GitHub Actions. The workflow installs dependencies, runs Go tests and vet, runs browser and Worker tests, builds the Pages assets, deploys the private Worker, and then deploys Pages. Cloudflare’s Durable Object state stays in place across deployments. The app runs at [canvas.rishirajpal.com](https://canvas.rishirajpal.com), and I published an [interactive architecture viewer](https://canvas.rishirajpal.com/arch) to make the request and data flows inspectable.

## What worked—and what I would change

The main win is a simpler operational model: no user-managed always-on server, Redis, or MongoDB for production; explicit ownership of each board; bounded temporary data; and live updates that continue during navigation and background-tab use. I have not published latency benchmarks, so I treat the 64-event batching result as a request-count improvement, not a measured speedup.

There is a trade-off I would revisit at larger scale. Persisting the complete cell array on each mutation is easy to reason about, but it amplifies writes for busy boards. A future version could store sparse pixel changes or compact binary state and benchmark the difference. For this project, the current design let me focus on correctness, predictable lifecycles, and a complete deployment pipeline while keeping the code small enough to inspect.

The source is on [GitHub](https://github.com/rishirajpal01/canvas). Canvas is a small visual product, but building it exercised the skills I care about most: data modeling, real-time coordination, browser performance, edge deployment, and making practical trade-offs visible in the code.
