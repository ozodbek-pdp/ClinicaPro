<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/420afd88-bf50-4268-8b2f-3fb0abc079ca

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Netlify deploy

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Environment variable:** set `VITE_API_BASE` to your backend URL (for example `https://api.yoursite.com` or `http://localhost:3000` for local testing). Netlify UI: Site settings → Build & deploy → Environment.

Optional: you can add a proxy rule in [netlify.toml](netlify.toml) to forward `/api/*` to your backend; see the example in that file.

Quick Netlify CLI deploy (example):

```bash
# Install Netlify CLI once
npm install -g netlify-cli

# Build the frontend
npm install
npm run build

# Deploy (set the prod flag to publish)
netlify deploy --prod --dir=dist
```

# ClinicaPro
