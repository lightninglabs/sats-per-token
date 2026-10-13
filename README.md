# Sats Per Token

The launch site for selling LLM inference by the token, settled in sats over
Lightning: [aperture](https://github.com/lightninglabs/aperture) (L402 + MPP)
with metered pricing, [lightmeter](https://github.com/lightninglabs/lightmeter),
[Wavelength](https://github.com/lightninglabs/wavelength) wallets on both sides,
and [pi-402](https://github.com/lightninglabs/pi-402) as an example buyer.

The site is static HTML, CSS and JS with no build step. three.js (pinned to
0.170.0) loads from jsDelivr, and fonts load from Google Fonts. Open
`index.html` directly, or serve the directory:

```bash
python3 -m http.server 8000
```

Every interactive panel is a simulation for teaching: no model runs in the
browser, and token counts are estimates.

A few query flags force the fallback paths for testing: `?render=webgl` skips
WebGPU, `?render=2d` uses the Canvas2D meter, and `?reduce=1` takes the
reduced-motion path.

## Hosting

GitHub Pages, deployed from `main` at the repository root. A custom domain is
set with a `CNAME` file at the root plus a DNS record pointing at
`lightninglabs.github.io`.
