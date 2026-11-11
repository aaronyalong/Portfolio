/**
 * Cursor spotlight: while the pointer is over an element marked `data-spotlight`, its
 * position is written as `--mx` / `--my`, which CSS turns into a soft radial glow.
 *
 * - `data-spotlight` (no value): the element paints its own glow (see global.css).
 * - `data-spotlight=".selector"`: the pointer is tracked over the element, but the position
 *   is measured against, and written to, that inner layer (the home hero's full-width
 *   background, which is larger than the hero itself).
 *
 * One shared listener, at most one update per frame. Skipped on touch screens, where there
 * is no cursor to follow.
 */
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

if (finePointer.matches) {
	let active: HTMLElement | null = null;
	let pending: PointerEvent | null = null;
	let frame = 0;

	/** The element that receives --mx / --my for a [data-spotlight] host. */
	const layerOf = (host: HTMLElement): HTMLElement =>
		(host.dataset.spotlight && host.querySelector<HTMLElement>(host.dataset.spotlight)) || host;

	const clear = (el: HTMLElement | null) => {
		el?.style.removeProperty('--mx');
		el?.style.removeProperty('--my');
	};

	const update = () => {
		frame = 0;
		if (!pending) return;
		const target = pending.target instanceof Element ? pending.target : null;
		const host = target?.closest<HTMLElement>('[data-spotlight]') ?? null;
		const layer = host ? layerOf(host) : null;
		if (active !== layer) clear(active);
		active = layer;
		if (layer) {
			const box = layer.getBoundingClientRect();
			layer.style.setProperty('--mx', `${pending.clientX - box.left}px`);
			layer.style.setProperty('--my', `${pending.clientY - box.top}px`);
		}
	};

	document.addEventListener(
		'pointermove',
		(event) => {
			pending = event;
			if (!frame) frame = requestAnimationFrame(update);
		},
		{ passive: true },
	);

	// Pointer left the window: switch the glow off.
	document.documentElement.addEventListener('pointerleave', () => {
		clear(active);
		active = null;
	});
}
