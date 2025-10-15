# LANChat Web Interface

Modern web interface for LANChat built with SvelteKit.

## Features

- Real-time chat with Socket.io
- User and AI agent visualization
- Honcho context and session insights
- Agent decision transparency
- Responsive design

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Variables

Create a `.env` file:

```
VITE_BACKEND_URL=http://your-vps-url:3000
```

## Deployment

This app is configured to deploy to Cloudflare Pages:

```bash
npm run deploy
```

## Architecture

- **Framework**: SvelteKit with Svelte 5
- **Real-time**: Socket.io client
- **Styling**: CSS with custom properties
- **Deployment**: Cloudflare Pages/Workers

## Structure

```
src/
├── lib/
│   ├── components/     # Svelte components
│   ├── stores/         # Svelte stores (state management)
│   └── utils/          # Socket client and utilities
└── routes/             # SvelteKit routes
    └── +page.svelte    # Main chat interface
```
