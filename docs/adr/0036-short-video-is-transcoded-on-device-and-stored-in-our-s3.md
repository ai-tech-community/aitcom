# Short video is transcoded on the device and stored in our own S3

**Status:** accepted

Community short videos (feed posts and Reels mode) are converted to 720p H.264 MP4 plus a JPEG thumbnail **in the uploader's browser** using WebCodecs (via the Mediabunny library). They're uploaded **directly from the browser to our existing S3 bucket** with narrow presigned POST grants. Public videos are read by direct URL. Community-only videos live under a private prefix and are read through one-hour presigned GET links that the server issues only to members. There's no third-party video platform and no server-side transcoding.

**Why:**

- **Storage.** Keeping video in the bucket we already run adds no new vendor, no second billing relationship, and no data processor outside our AWS account, and one storage module owns all video access.
- **Conversion on the device.**
  - It solves the real compatibility problem: iPhone HEVC doesn't play in many desktop browsers.
  - It shrinks a 4K phone recording about tenfold *before* it crosses a mobile connection, so posting is faster for the person doing it.
  - It adds no per-video server cost and no processing queue.
- **Direct upload.** Uploading straight to S3 is required anyway: video is far larger than a Vercel Function's 4.5 MB request body.
- **The price.** A browser without WebCodecs H.264 encoding can't post video. It gets a clear message rather than a broken upload. Every current Chrome, Safari, Edge, and Firefox has it.

**Rejected alternatives:**

- **Mux (Vercel Marketplace video provider).** It gives the best playback (adaptive streaming, automatic posters, signed playback) with little code. Rejected by the product owner in favour of our own storage and conversion. It stays the natural upgrade if adaptive streaming or analytics become necessary. Because `src/server/media/video-storage.ts` is the only module that touches video storage, switching later is contained.
- **Store originals in S3 without converting.** It's the simplest option, but HEVC clips fail to play in many browsers, 4K files stream poorly on phones, and thumbnails would need separate work.
- **Server-side ffmpeg in a Vercel Function.** It works for every browser, but the uploader sends the full 4K file, every video costs server time, and it needs a job queue and a "processing" state. It stays a possible *fallback* for browsers that can't convert, if they turn out to matter.
- **Vercel Blob.** It has the same playback limits as unconverted S3 and would add a second storage location, with no gain.

**Consequences:**

- `src/lib/video-rules.ts` is the single source of limits (90 s, 40 MB, 720p) for both client and server.
- The server never trusts client-supplied video metadata for access decisions. It verifies each object's existence, type, and size before a post is created.
- Community-only playback depends on the bucket keeping `private/` non-public. That's an operational prerequisite checked at launch.
- The bucket needs a CORS rule for browser uploads, and a daily cleanup job removes uploads that were never finished.
