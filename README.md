# mon.group

Static site for Mon Group (The Monetization Group, LLC), served by GitHub Pages at https://www.mon.group.

- `index.html`, `contact/index.html`: the two pages. No build step; edit and push to `main`.
- `assets/`: CSS, JS, logo, and the ad creative (GIFs converted to MP4 with ffmpeg, statics to WebP).
- `_worker/`: the Cloudflare Worker behind the contact form (`mongroup-leads`). It saves every lead in KV and emails it to cyrus@mon.group through Resend. Deploy with `cd _worker && npm run deploy`; list saved leads with `npm run leads`.

Folders that start with `_` are not published (Jekyll skips them).
