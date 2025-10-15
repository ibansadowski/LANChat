import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		proxy: {
			'/api': {
				target: process.env.VITE_BACKEND_URL || 'http://localhost:3000',
				changeOrigin: true
			}
		}
	}
});
