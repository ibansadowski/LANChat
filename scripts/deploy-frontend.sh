#!/bin/bash

# Deploy frontend to Cloudflare Pages
set -e

echo "Building LANChat frontend..."
cd web
npm install
npm run build

echo ""
echo "Build complete! Output directory: .svelte-kit/cloudflare"
echo ""
echo "To deploy to Cloudflare Pages:"
echo "1. Via CLI:"
echo "   wrangler pages deploy .svelte-kit/cloudflare --project-name=lanchat"
echo ""
echo "2. Via GitHub:"
echo "   - Push to GitHub"
echo "   - Cloudflare will auto-deploy"
echo ""
echo "Don't forget to set VITE_BACKEND_URL in Cloudflare Pages environment variables!"
