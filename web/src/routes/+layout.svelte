<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';

	const { children } = $props();
</script>

{@render children()}
