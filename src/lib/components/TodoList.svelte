<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import {
		CalendarDays,
		Check,
		Clock,
		GripVertical,
		Plus,
		Repeat as RepeatIcon,
		Trash2,
		X
	} from '@lucide/svelte';
	import { addDays, dayNumber, monthShort, weekdayShort } from '#lib/format.ts';
	import { quickParse, type Token } from '#lib/quick-parse.ts';
	import { repeatLabel, repeatOptions, type Repeat } from '#lib/repeat.ts';
	import { MAX_TODO_LENGTH, type TodoItem } from '#lib/todo-api.ts';
	import { LOCAL_RULE, applyTodoOps, isRecurring, type TodoOp } from '#lib/outbox-ops.ts';
	import { newId, outbox } from '#lib/outbox.svelte.ts';

	type Row = TodoItem;

	let {
		items,
		checklistId,
		day,
		today,
		variant = 'day',
		shortcuts = false,
		title
	}: {
		title?: string;
		items: TodoItem[];
		checklistId: string;
		/** giorno della lista ("Domani" = il giorno dopo); per le liste delle note, oggi */
		day: string;
		today: string;
		/** 'day': lista del giorno (sposta, ripeti); 'note': checklist di una nota */
		variant?: 'day' | 'note';
		/** scorciatoie da tastiera globali (N, Ctrl+Z): solo per una lista per pagina */
		shortcuts?: boolean;
	} = $props();

	const uid = $props.id();
	const canMove = $derived(variant === 'day');
	// stato locale: le modifiche si vedono subito e il server conferma dopo
	let list = $state<Row[]>(untrack(() => items.map((i) => ({ ...i }))));
	const undone = $derived(list.filter((r) => !r.done));
	const ordered = $derived([...undone, ...list.filter((r) => r.done)]);
	const doneCount = $derived(list.length - undone.length);

	const find = (id: string | null) => list.find((r) => r.id === id);
	const indexOf = (id: string) => list.findIndex((r) => r.id === id);

	// --- Coda offline ---
	// Le modifiche partono dalla coda (outbox): subito con la rete, più tardi senza. I dati della
	// pagina possono venire dalla cache, quindi le operazioni in coda si rimettono sopra; lo stesso
	// per quelle aggiunte dopo da altre parti della pagina (es. "Porta a oggi" dai todo in sospeso).
	// Riapplicare un'operazione già vista non cambia nulla.
	const where = untrack(() => ({ checklistId, day: variant === 'day' ? day : null }));
	let seen = 0;
	let mounted = $state(false);
	onMount(() => (mounted = true));
	$effect(() => {
		if (!mounted) return;
		const fresh = outbox.entries.filter((e) => e.kind === 'todo' && e.seq > seen);
		if (!fresh.length) return;
		seen = Math.max(...fresh.map((e) => e.seq));
		const ops = fresh.flatMap((e) => (e.kind === 'todo' ? [e.body] : []));
		untrack(() => (list = applyTodoOps(list, ops, where)));
	});

	/** Mette in coda e, quando il server risponde, prende i dati come li ha salvati lui. */
	function send(op: TodoOp) {
		void outbox.todo(op).then((outcome) => {
			if (!outcome.ok || !outcome.data) return;
			const data = outcome.data as { item?: TodoItem | null; items?: TodoItem[] };
			for (const item of data.items ?? (data.item ? [data.item] : [])) {
				const row = find(item.id);
				if (row) Object.assign(row, item);
			}
		});
	}

	function dayLabel(d: string) {
		if (d === today) return 'oggi';
		if (d === addDays(today, 1)) return 'domani';
		return `${weekdayShort(d)} ${dayNumber(d)} ${monthShort(d)}`;
	}

	// --- Avviso con "Annulla" ---

	let toast = $state<{ message: string; undo?: () => Promise<void> } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;
	function showToast(message: string, undo?: () => Promise<void>) {
		toast = { message, undo };
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 5000);
	}
	async function runUndo() {
		const undo = toast?.undo;
		toast = null;
		if (!undo) return;
		try {
			await undo();
		} catch {
			showToast('Annullamento non riuscito');
		}
	}
	onDestroy(() => clearTimeout(toastTimer));

	// --- Aggiunta (con riconoscimento di giorno, ora e ripetizione) ---

	let draft = $state('');
	let off = $state<Token['kind'][]>([]);
	let input: HTMLInputElement;
	const parsed = $derived(draft.trim() ? quickParse(draft, today, off) : null);
	const TOKEN_ICON = { day: '→', time: '◷', repeat: '↻' } as const;
	const TOKEN_COLOR = { day: 'text-neon', time: 'text-alert', repeat: 'text-soft' } as const;

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const raw = draft.trim();
		if (!raw) return;
		const p = quickParse(raw, today, off);
		draft = '';
		off = [];
		input.focus();
		add([p.text], {
			day: canMove ? p.day : null,
			time: p.time,
			repeat: canMove ? p.repeat : null
		});
	}

	/** Più righe incollate: un todo per riga, senza riconoscimento. */
	function onPaste(event: ClipboardEvent) {
		const lines = (event.clipboardData?.getData('text') ?? '')
			.split(/\r?\n/)
			.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]?\])\s*/i, '').trim())
			.filter(Boolean)
			.map((l) => l.slice(0, MAX_TODO_LENGTH));
		if (lines.length < 2) return;
		event.preventDefault();
		add(lines.slice(0, 50), {});
	}

	function add(
		texts: string[],
		opts: { day?: string | null; time?: string | null; repeat?: Repeat | null }
	) {
		const elsewhere = !!opts.day && opts.day !== day;
		const ids = texts.map(() => newId());
		const time = opts.time ?? null;
		const repeat = opts.repeat ?? null;
		if (!elsewhere)
			list.push(
				...texts.map((text, i) => ({
					id: ids[i],
					text,
					done: false,
					ruleId: repeat ? LOCAL_RULE : null,
					repeat,
					time
				}))
			);
		send({
			op: 'create',
			ids,
			texts,
			time,
			repeat,
			...(elsewhere ? { day: opts.day! } : { checklistId })
		});
		if (elsewhere) showToast(`Aggiunto a ${dayLabel(opts.day!)}`);
	}

	// --- Spunta, modifica, sposta, elimina ---

	function toggle(row: Row) {
		row.done = !row.done;
		send({ op: 'toggle', id: row.id, done: row.done });
	}

	let editingId = $state<string | null>(null);
	let editText = $state('');
	let editInput = $state<HTMLInputElement>();

	async function startEdit(row: Row) {
		editingId = row.id;
		editText = row.text;
		close();
		await tick();
		editInput?.focus();
	}

	function saveEdit() {
		const row = find(editingId);
		editingId = null;
		if (!row) return;
		const text = editText.replace(/\s+/g, ' ').trim();
		if (!text) return remove(row);
		if (text === row.text) return;
		row.text = text;
		send({ op: 'text', id: row.id, text });
	}

	function move(row: Row, toDay: string) {
		if (toDay === day) return;
		const at = indexOf(row.id);
		if (at < 0) return;
		const item = $state.snapshot(row);
		list.splice(at, 1);
		editingId = null;
		close();
		// un ricorrente spostato diventa un todo nuovo: l'id lo sceglie già qui
		const movedId = isRecurring(item) ? newId() : undefined;
		send({ op: 'move', id: item.id, day: toDay, newId: movedId, item });
		showToast(`Spostato a ${dayLabel(toDay)}`, async () => {
			const back: TodoItem = movedId
				? { ...item, id: movedId, done: false, ruleId: null, repeat: null }
				: { ...item, done: false };
			list.splice(Math.min(at, list.length), 0, back);
			send({ op: 'move', id: back.id, day, item: back });
		});
	}

	function remove(row: Row) {
		const at = indexOf(row.id);
		if (at < 0) return;
		const item = $state.snapshot(row);
		list.splice(at, 1);
		editingId = null;
		close();
		send({ op: 'delete', id: item.id });
		showToast('Todo eliminato', async () => {
			list.splice(Math.min(at, list.length), 0, item);
			send({ op: 'restore', id: item.id, checklistId, at, item });
		});
	}

	function setRepeat(row: Row, repeat: Repeat | null) {
		row.repeat = repeat;
		if (repeat && !row.ruleId) row.ruleId = LOCAL_RULE;
		send({ op: 'repeat', id: row.id, repeat });
	}

	function setTime(row: Row, time: string | null) {
		row.time = time;
		send({ op: 'time', id: row.id, time });
	}

	// --- Scorrimento a sinistra: "Domani" ed "Elimina"; fino in fondo elimina ---

	const actionsWidth = $derived(canMove ? 160 : 80);
	const FULL_SWIPE = 240;
	let offsets = $state<Record<string, number>>({});
	let openId = $state<string | null>(null);
	let gesture = $state<{
		id: string;
		x: number;
		y: number;
		start: number;
		swiping: boolean;
	} | null>(null);
	let swipedAt = 0;

	function close() {
		if (openId) offsets[openId] = 0;
		openId = null;
	}

	function pointerDown(event: PointerEvent, row: Row) {
		if (editingId === row.id || event.button !== 0) return;
		if (openId && openId !== row.id) close();
		gesture = {
			id: row.id,
			x: event.clientX,
			y: event.clientY,
			start: offsets[row.id] ?? 0,
			swiping: false
		};
	}

	function pointerMove(event: PointerEvent) {
		if (!gesture) return;
		const dx = event.clientX - gesture.x;
		const dy = event.clientY - gesture.y;
		if (!gesture.swiping) {
			if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
				gesture.swiping = true;
				(event.currentTarget as Element).setPointerCapture(event.pointerId);
			} else if (Math.abs(dy) > 10) {
				gesture = null;
				return;
			} else return;
		}
		offsets[gesture.id] = Math.min(0, gesture.start + dx);
	}

	function pointerUp(row: Row) {
		const swiped = gesture?.swiping;
		gesture = null;
		if (!swiped) return;
		swipedAt = Date.now();
		const offset = offsets[row.id] ?? 0;
		if (offset < -FULL_SWIPE) {
			offsets[row.id] = 0;
			remove(row);
		} else if (offset < -actionsWidth / 2) {
			offsets[row.id] = -actionsWidth;
			openId = row.id;
		} else {
			offsets[row.id] = 0;
			if (openId === row.id) openId = null;
		}
	}

	/** Tocco sul testo: modifica, ma non subito dopo uno scorrimento. */
	function clickText(row: Row) {
		if (Date.now() - swipedAt < 300) return;
		if (openId === row.id) return close();
		startEdit(row);
	}

	// --- Riordino trascinando la maniglia ---

	let listEl: HTMLUListElement;
	let dragId = $state<string | null>(null);

	function dragStart(event: PointerEvent, row: Row) {
		event.preventDefault();
		dragId = row.id;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
	}

	function dragMove(event: PointerEvent) {
		if (!dragId) return;
		const rows = [...listEl.querySelectorAll<HTMLElement>('li[data-undone]')];
		let target = rows.findIndex((el) => {
			const box = el.getBoundingClientRect();
			return event.clientY < box.top + box.height / 2;
		});
		if (target < 0) target = rows.length - 1;
		const order = undone.map((r) => r.id);
		const from = order.indexOf(dragId);
		if (from < 0 || target === from) return;
		const next = [...undone];
		const [moved] = next.splice(from, 1);
		next.splice(target, 0, moved);
		list = [...next, ...list.filter((r) => r.done)];
	}

	function dragEnd() {
		if (!dragId) return;
		dragId = null;
		send({ op: 'reorder', checklistId, ids: list.map((r) => r.id) });
	}

	// --- Tastiera ---

	/** Il fuoco da tastiera sta sul testo di ogni todo (un pulsante: Invio lo modifica). */
	function focusRow(from: HTMLElement | null, step: number) {
		const rows = [...listEl.querySelectorAll<HTMLElement>('[data-row-focus]')];
		const at = from ? rows.indexOf(from) : -1;
		const next = at + step;
		if (next < 0) input.focus();
		else rows[Math.min(next, rows.length - 1)]?.focus();
	}

	function rowKey(event: KeyboardEvent, row: Row) {
		const el = event.currentTarget as HTMLElement;
		const actions: Record<string, () => void> = {
			ArrowDown: () => focusRow(el, 1),
			ArrowUp: () => focusRow(el, -1),
			' ': () => toggle(row),
			Enter: () => startEdit(row),
			e: () => startEdit(row),
			Delete: () => {
				focusRow(el, 1);
				remove(row);
			},
			Backspace: () => {
				focusRow(el, -1);
				remove(row);
			}
		};
		const action = actions[event.key];
		if (action && !event.ctrlKey && !event.metaKey && !event.altKey) {
			event.preventDefault();
			action();
		}
	}

	function globalKey(event: KeyboardEvent) {
		if (!shortcuts) return;
		const target = event.target as HTMLElement;
		const typing = target.closest('input, textarea, select, [contenteditable="true"]') !== null;
		if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !typing && toast?.undo) {
			event.preventDefault();
			runUndo();
		} else if (event.key === 'n' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
			event.preventDefault();
			input.focus();
		}
	}
</script>

<svelte:window onkeydown={globalKey} />

<div class="flex flex-col gap-1.5">
	<div class="flex items-baseline justify-between gap-2 pl-2.5">
		{#if title}<h2 class="text-xl font-bold text-volt uppercase">{title}</h2>{/if}
		{#if list.length}
			<span class="lbl font-semibold text-neon" aria-live="polite">
				{doneCount}/{list.length}<span class="sr-only"> completati</span>
			</span>
		{/if}
	</div>
	{#if list.length}
		<div aria-hidden="true" class="mb-1 h-1 bg-line">
			<div
				class="h-1 bg-volt transition-[width]"
				style:width="{(doneCount / list.length) * 100}%"
			></div>
		</div>
	{/if}

	<form class="flex gap-1.5" onsubmit={submit}>
		<label for="{uid}-add" class="sr-only">Nuovo todo</label>
		<input
			id="{uid}-add"
			bind:this={input}
			bind:value={draft}
			maxlength={MAX_TODO_LENGTH}
			autocomplete="off"
			enterkeyhint="done"
			placeholder="+ Aggiungi un todo…"
			class="input min-h-11 flex-1"
			onpaste={onPaste}
			onkeydown={(e) => {
				if (e.key === 'ArrowDown' && !draft) {
					e.preventDefault();
					focusRow(null, 1);
				}
			}}
		/>
		<button class="btn-primary min-h-11 w-12 px-0" aria-label="Aggiungi">
			<Plus size={20} strokeWidth={3} aria-hidden="true" />
		</button>
	</form>
	{#if parsed?.tokens.length}
		<div class="flex flex-wrap items-center gap-1.5">
			{#each parsed.tokens as token (token.kind)}
				<button
					type="button"
					class="chip min-h-7 px-2 {TOKEN_COLOR[token.kind]}"
					aria-label="Non riconoscere: {token.label}"
					onclick={() => (off = [...off, token.kind])}
				>
					{TOKEN_ICON[token.kind]}
					{token.label}
					<X size={12} aria-hidden="true" />
				</button>
			{/each}
			<span class="ml-auto lbl text-[10px] text-dim max-md:hidden">Invio = aggiungi e continua</span
			>
		</div>
	{/if}

	<ul bind:this={listEl} class="flex flex-col">
		{#each ordered as row (row.id)}
			{@const editing = editingId === row.id}
			{@const offset = offsets[row.id] ?? 0}
			<li
				data-id={row.id}
				data-undone={row.done ? undefined : ''}
				class="group relative -mx-3.5 overflow-hidden px-3.5 {dragId === row.id
					? 'z-10 bg-raised'
					: ''}"
				animate:flip={{ duration: dragId ? 0 : 150 }}
			>
				{#if editing}
					<div
						class="-mx-1.5 my-1 flex flex-col panel-top border-neon text-neon"
						onfocusout={(e) => {
							if (!e.currentTarget.contains(e.relatedTarget as Node)) saveEdit();
						}}
					>
						<div class="flex items-center gap-2.5 px-2">
							<span class="box border-neon" aria-hidden="true"></span>
							<label for="{uid}-edit" class="sr-only">Modifica todo</label>
							<input
								id="{uid}-edit"
								bind:this={editInput}
								bind:value={editText}
								maxlength={MAX_TODO_LENGTH}
								enterkeyhint="done"
								class="h-10 min-w-0 flex-1 border-0 bg-transparent p-0 text-base font-semibold text-white focus:ring-0"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										saveEdit();
									} else if (e.key === 'Escape') {
										e.preventDefault();
										editingId = null;
									}
								}}
							/>
						</div>
						<div class="flex flex-wrap items-center border-t border-line px-1">
							{#if canMove}
								<label class="relative flex size-11 items-center justify-center text-neon">
									<CalendarDays size={20} aria-hidden="true" />
									<span class="sr-only">Sposta a un altro giorno</span>
									<input
										type="date"
										value={day}
										class="absolute inset-0 cursor-pointer opacity-0"
										onchange={(e) => e.currentTarget.value && move(row, e.currentTarget.value)}
									/>
								</label>
							{/if}
							<label class="relative flex h-11 items-center gap-1 px-2.5 text-volt">
								<Clock size={20} aria-hidden="true" />
								{#if row.time}<span class="text-xs font-bold">{row.time}</span>{/if}
								<span class="sr-only">Promemoria</span>
								<input
									type="time"
									value={row.time ?? ''}
									class="absolute inset-0 cursor-pointer opacity-0"
									onchange={(e) => setTime(row, e.currentTarget.value || null)}
								/>
							</label>
							{#if row.time}
								<button
									class="flex size-9 items-center justify-center text-dim"
									aria-label="Togli il promemoria"
									onclick={() => setTime(row, null)}
								>
									<X size={14} aria-hidden="true" />
								</button>
							{/if}
							{#if canMove}
								<label class="flex h-11 items-center gap-1 pl-2.5 text-soft">
									<RepeatIcon size={20} aria-hidden="true" />
									<span class="sr-only">Ripeti</span>
									<select
										class="border-0 bg-void py-0 pr-7 pl-1 text-xs font-bold tracking-[1px] uppercase focus:ring-0"
										value={row.repeat ?? ''}
										onchange={(e) => setRepeat(row, e.currentTarget.value || null)}
									>
										<option value="">Non ripetere</option>
										{#if row.repeat && !repeatOptions(day).some((o) => o.value === row.repeat)}
											<option value={row.repeat}>{repeatLabel(row.repeat)}</option>
										{/if}
										{#each repeatOptions(day) as option (option.value)}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
								</label>
							{/if}
							<span class="flex-1"></span>
							<button
								class="flex size-11 items-center justify-center text-alert"
								aria-label="Elimina"
								onclick={() => remove(row)}
							>
								<Trash2 size={20} aria-hidden="true" />
							</button>
						</div>
					</div>
				{:else}
					<div class="absolute inset-y-0 right-0 flex" class:invisible={offset === 0}>
						{#if canMove}
							<button
								class="w-20 bg-neon lbl font-bold text-void"
								tabindex={openId === row.id ? 0 : -1}
								onclick={() => move(row, addDays(day, 1))}>Domani</button
							>
						{/if}
						<button
							class="w-20 bg-alert lbl font-bold text-void"
							tabindex={openId === row.id ? 0 : -1}
							onclick={() => remove(row)}>Elimina</button
						>
					</div>
					<!-- lo scorrimento è una scorciatoia: le stesse azioni ci sono con pulsanti e tastiera -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="relative -mx-3.5 flex min-h-11 touch-pan-y items-center gap-3 px-3.5 {offset
							? 'bg-raised'
							: 'bg-void'} {gesture?.id === row.id ? '' : 'transition-transform duration-150'}"
						style:transform="translateX({offset}px)"
						onpointerdown={(e) => pointerDown(e, row)}
						onpointermove={pointerMove}
						onpointerup={() => pointerUp(row)}
						onpointercancel={() => pointerUp(row)}
					>
						<button
							class={row.done ? 'box-on' : 'box'}
							aria-label="{row.done ? 'Fatto' : 'Da fare'}: {row.text}"
							aria-pressed={row.done}
							onclick={() => toggle(row)}
						>
							{#if row.done}<Check size={14} strokeWidth={3.5} aria-hidden="true" />{/if}
						</button>
						<button
							class="min-w-0 flex-1 py-2 text-left text-base font-medium wrap-break-word -outline-offset-2 {row.done
								? 'text-done line-through'
								: ''}"
							data-row-focus
							aria-label="Modifica: {row.text}"
							onclick={() => clickText(row)}
							onkeydown={(e) => rowKey(e, row)}
						>
							{row.text}
						</button>
						{#if row.time}
							<span class="shrink-0 lbl font-bold text-alert" title="Promemoria">◷ {row.time}</span>
						{/if}
						{#if row.repeat}
							<RepeatIcon
								size={16}
								class="shrink-0 text-dim"
								role="img"
								aria-label={repeatLabel(row.repeat)}
							/>
						{/if}
						<button
							class="hidden size-8 shrink-0 items-center justify-center text-alert group-hover:flex"
							aria-label="Elimina {row.text}"
							tabindex="-1"
							onclick={() => remove(row)}
						>
							<X size={16} aria-hidden="true" />
						</button>
						{#if !row.done}
							<button
								class="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center text-field hover:text-volt"
								aria-label="Trascina per riordinare"
								tabindex="-1"
								onpointerdown={(e) => {
									e.stopPropagation();
									dragStart(e, row);
								}}
								onpointermove={dragMove}
								onpointerup={dragEnd}
								onpointercancel={dragEnd}
							>
								<GripVertical size={16} aria-hidden="true" />
							</button>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
	{#if !list.length}
		<p class="text-[15px] text-dim">Niente da fare, per ora.</p>
	{/if}
</div>

{#if toast}
	<div
		role="status"
		class="fixed inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex min-h-13 items-center justify-between gap-3 bg-ink py-1.5 pr-1.5 pl-3.5 text-void cut md:right-auto md:bottom-6 md:left-25 md:w-96"
	>
		<span class="font-bold first-letter:uppercase">{toast.message}</span>
		{#if toast.undo}
			<button class="h-10 bg-void px-3 lbl font-bold text-volt" onclick={runUndo}>Annulla</button>
		{/if}
	</div>
{/if}
