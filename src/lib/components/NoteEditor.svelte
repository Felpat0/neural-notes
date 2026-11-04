<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Editor, type JSONContent } from '@tiptap/core';
	import StarterKit from '@tiptap/starter-kit';
	import Highlight from '@tiptap/extension-highlight';
	import { Placeholder } from '@tiptap/extensions';
	import { ChecklistEmbed } from '#lib/editor/checklist-embed.ts';
	import { isCached } from '#lib/offline-pages.ts';
	import { newId, outbox, type NoteVersion } from '#lib/outbox.svelte.ts';
	import {
		Bell,
		CalendarDays,
		ChevronLeft,
		Highlighter,
		ListChecks,
		Link2,
		List,
		ListOrdered,
		Maximize2,
		Minimize2,
		Pin,
		PinOff,
		Quote,
		Trash2,
		X
	} from '@lucide/svelte';
	import { dayNumber, monthShort, weekdayShort } from '#lib/format.ts';
	import { MAX_TAG_LENGTH, cleanTags } from '#lib/notes.ts';
	import { editQuery } from '#lib/url.ts';

	type Note = {
		id: string;
		title: string;
		content: unknown;
		day: string | null;
		tags: string[];
		pinned: boolean;
		/** null: nota appena creata sul dispositivo (non ancora sul server) */
		updatedAt: Date | string | null;
	};
	type Patch = Partial<{
		title: string;
		content: JSONContent;
		text: string;
		day: string | null;
		tags: string[];
		pinned: boolean;
	}>;
	type Conflict = NoteVersion;

	let {
		note,
		today,
		reminder: initialReminder
	}: {
		note: Note;
		today: string;
		/** prossimo promemoria, "AAAA-MM-GGTHH:MM" nel fuso dell'utente */
		reminder: string | null;
	} = $props();
	// l'editor parte dalla versione caricata, con sopra le modifiche ancora in coda (fatte offline:
	// la pagina può venire dalla cache); da lì in poi lo stato è locale
	const initial = untrack(() => note);
	const queuedAtStart = untrack(() => outbox.note(initial.id));
	function start<K extends keyof Patch & keyof Note>(key: K): Note[K] {
		const patch = queuedAtStart?.patch as Partial<Note> | undefined;
		return patch && key in patch ? (patch[key] as Note[K]) : initial[key];
	}
	const iso = (d: Date | string) => new Date(d).toISOString();

	let title = $state(start('title'));
	let day = $state(start('day'));
	let tags = $state(start('tags'));
	let pinned = $state(start('pinned'));
	let tagInput = $state('');

	// --- Salvataggio automatico ---
	// Le modifiche vanno nella coda offline (outbox), salvata sul dispositivo, che le invia appena
	// può: chiudere l'app o perdere la rete non le perde. Il conflitto (nota salvata altrove nel
	// frattempo) arriva dalla coda e si risolve qui.

	const SAVE_DELAY = 800;
	const queued = $derived(outbox.note(initial.id));
	const conflict = $derived<Conflict | null>(queued?.conflict ?? null);
	let typing = $state(false);
	const status = $derived(
		conflict
			? 'conflict'
			: queued?.error
				? 'error'
				: typing
					? 'pending'
					: queued
						? outbox.online
							? 'saving'
							: 'offline'
						: 'saved'
	);
	let pending: Patch = {};
	// versione di riferimento (null: nota creata sul dispositivo, nessun controllo)
	let base: string | null = initial.updatedAt ? iso(initial.updatedAt) : null;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function change(patch: Patch, delay = SAVE_DELAY) {
		pending = { ...pending, ...patch };
		typing = true;
		clearTimeout(timer);
		timer = setTimeout(persist, delay);
	}

	/** Passa le modifiche alla coda (che le salva sul dispositivo e le invia). */
	function persist() {
		clearTimeout(timer);
		typing = false;
		if (!Object.keys(pending).length) return;
		outbox.saveNote(initial.id, pending, base);
		pending = {};
	}

	// salvate sul server: la nuova versione è il riferimento per le prossime modifiche
	const stopListening = outbox.onNoteSaved((event) => {
		if (event.noteId !== initial.id) return;
		base = iso(event.updatedAt);
		// tag come li ha salvati il server, se nel frattempo non sono cambiati qui
		if (event.tags && !pending.tags && !outbox.note(initial.id)?.patch.tags) tags = event.tags;
	});

	// nota cambiata su un altro dispositivo (dati ricaricati da lib/sync): se qui non ci sono
	// modifiche da salvare si mostra la versione nuova; altrimenti ci pensa il conflitto al salvataggio
	$effect(() => {
		const fresh = note;
		untrack(() => {
			if (!fresh.updatedAt || !base || !editor) return;
			if (new Date(fresh.updatedAt) <= new Date(base)) return;
			if (typing || Object.keys(pending).length || outbox.note(initial.id)) return;
			const { from, to } = editor.state.selection;
			applying = true;
			editor.commands.setContent((fresh.content as JSONContent) ?? '', { emitUpdate: false });
			applying = false;
			// il cursore resta dov'era (per quanto possibile nel testo nuovo)
			const end = editor.state.doc.content.size;
			editor.commands.setTextSelection({ from: Math.min(from, end), to: Math.min(to, end) });
			title = fresh.title;
			day = fresh.day;
			tags = fresh.tags;
			pinned = fresh.pinned;
			base = iso(fresh.updatedAt);
		});
	});

	/** Conflitto: tiene la versione salvata dall'altro dispositivo. */
	function useTheirs() {
		if (!conflict) return;
		const theirs = conflict;
		clearTimeout(timer);
		pending = {};
		typing = false;
		applying = true;
		editor?.commands.setContent((theirs.content as JSONContent) ?? '');
		applying = false;
		title = theirs.title;
		day = theirs.day;
		tags = theirs.tags;
		pinned = theirs.pinned;
		base = iso(theirs.updatedAt);
		outbox.resolveConflict(initial.id, null);
	}

	/** Conflitto: sovrascrive con questa versione. */
	function keepMine() {
		if (!editor) return;
		clearTimeout(timer);
		pending = {};
		typing = false;
		outbox.resolveConflict(initial.id, {
			title,
			day,
			tags,
			pinned,
			content: editor.getJSON(),
			text: plainText(editor)
		});
	}

	beforeNavigate(persist);
	function onVisibility() {
		if (document.visibilityState === 'hidden') persist();
	}
	function onBeforeUnload(event: BeforeUnloadEvent) {
		if (typing) {
			persist();
			event.preventDefault();
		}
	}

	// --- Editor ---

	let element: HTMLDivElement;
	let titleEl: HTMLTextAreaElement;
	let editor = $state.raw<Editor | null>(null);
	let tick = $state(0); // cambia a ogni transazione: aggiorna lo stato dei pulsanti
	let applying = false;

	const plainText = (e: Editor) => e.getText({ blockSeparator: '\n' });

	onMount(() => {
		editor = new Editor({
			element,
			extensions: [
				StarterKit.configure({
					heading: { levels: [1, 2] },
					codeBlock: false,
					link: {
						openOnClick: false,
						autolink: true,
						defaultProtocol: 'https',
						HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' }
					}
				}),
				Highlight,
				Placeholder.configure({ placeholder: 'Scrivi qui…' }),
				ChecklistEmbed.configure({ today })
			],
			content: (start('content') as JSONContent) ?? '',
			editorProps: {
				attributes: {
					class: 'note-body min-h-[40vh] pb-8',
					'aria-label': 'Testo della nota'
				}
			},
			onTransaction: () => tick++,
			onUpdate: ({ editor }) => {
				if (!applying) change({ content: editor.getJSON(), text: plainText(editor) });
			}
		});
		// nota nuova: si comincia dal titolo
		if (!title && editor.isEmpty) titleEl.focus();
	});

	onDestroy(() => {
		persist();
		stopListening();
		editor?.destroy();
	});

	/** Stato del pulsante: legge `tick`, così si aggiorna a ogni transazione dell'editor. */
	function is(name: string, attrs?: Record<string, unknown>) {
		void tick;
		return editor?.isActive(name, attrs) ?? false;
	}

	const TOOLS = [
		{
			key: 'bold',
			label: 'Grassetto',
			text: 'B',
			run: (e: Editor) => e.chain().focus().toggleBold().run()
		},
		{
			key: 'italic',
			label: 'Corsivo',
			text: 'I',
			run: (e: Editor) => e.chain().focus().toggleItalic().run()
		},
		{
			key: 'underline',
			label: 'Sottolineato',
			text: 'U',
			run: (e: Editor) => e.chain().focus().toggleUnderline().run()
		},
		{
			key: 'heading',
			attrs: { level: 1 },
			label: 'Titolo 1',
			text: 'H1',
			run: (e: Editor) => e.chain().focus().toggleHeading({ level: 1 }).run()
		},
		{
			key: 'heading',
			attrs: { level: 2 },
			label: 'Titolo 2',
			text: 'H2',
			run: (e: Editor) => e.chain().focus().toggleHeading({ level: 2 }).run()
		},
		{
			key: 'bulletList',
			label: 'Elenco puntato',
			icon: List,
			run: (e: Editor) => e.chain().focus().toggleBulletList().run()
		},
		{
			key: 'orderedList',
			label: 'Elenco numerato',
			icon: ListOrdered,
			run: (e: Editor) => e.chain().focus().toggleOrderedList().run()
		},
		{
			key: 'blockquote',
			label: 'Citazione',
			icon: Quote,
			run: (e: Editor) => e.chain().focus().toggleBlockquote().run()
		},
		{
			key: 'highlight',
			label: 'Evidenzia',
			icon: Highlighter,
			run: (e: Editor) => e.chain().focus().toggleHighlight().run()
		}
	];

	// --- Link ---

	let linkOpen = $state(false);
	let linkUrl = $state('');
	function openLink() {
		if (!editor) return;
		linkUrl = editor.getAttributes('link').href ?? '';
		linkOpen = true;
	}
	function applyLink(event: SubmitEvent) {
		event.preventDefault();
		if (!editor) return;
		const url = linkUrl.trim();
		const chain = editor.chain().focus().extendMarkRange('link');
		if (!url) chain.unsetLink().run();
		else chain.setLink({ href: /^[a-z][a-z\d+.-]*:/i.test(url) ? url : `https://${url}` }).run();
		linkOpen = false;
	}

	// --- Checklist ---

	/** Crea una checklist della nota (id scelto qui, va bene anche offline) e la inserisce. */
	function insertChecklist() {
		if (!editor) return;
		const checklistId = newId();
		void outbox.todo({ op: 'createChecklist', noteId: initial.id, id: checklistId });
		editor.chain().focus().insertChecklist(checklistId).run();
	}

	// --- Giorno, tag, fissata ---

	// --- Promemoria (non fa parte del salvataggio automatico: ha la sua rotta) ---

	// quello ancora in coda, se c'è, è il più recente
	let reminder = $state(
		untrack(() => {
			const queuedReminder = outbox.reminder(initial.id);
			return queuedReminder ? queuedReminder.at : initialReminder;
		})
	);
	const reminderLabel = (at: string) => {
		const day = at.slice(0, 10);
		const time = at.slice(11, 16);
		return day === today
			? time
			: `${weekdayShort(day)} ${dayNumber(day)} ${monthShort(day)} · ${time}`;
	};
	// cambiato su un altro dispositivo (dati ricaricati): vale se qui non ce n'è uno da inviare
	$effect(() => {
		const fresh = initialReminder;
		untrack(() => {
			if (!outbox.reminder(initial.id)) reminder = fresh;
		});
	});
	function setReminder(at: string | null) {
		reminder = at;
		outbox.setReminder(initial.id, at);
	}

	// --- Eliminazione (nel cestino; anche offline, parte con la coda) ---

	let deleting = $state(false);
	async function deleteNote(event: SubmitEvent) {
		event.preventDefault();
		if (deleting) return;
		deleting = true;
		clearTimeout(timer);
		pending = {};
		typing = false;
		const sent = outbox.deleteNote(initial.id);
		// con la rete si aspetta il server, per poter offrire "Annulla" nell'elenco
		const outcome = navigator.onLine
			? await Promise.race([sent, new Promise<null>((r) => setTimeout(() => r(null), 4000))])
			: null;
		if (outcome?.ok) await goto(`/note?eliminata=${initial.id}`, { invalidateAll: true });
		else await goto((await isCached('/note')) ? '/note' : '/');
	}

	function setDay(value: string | null) {
		day = value || null;
		change({ day }, 0);
	}
	function addTag() {
		const next = cleanTags([...tags, ...tagInput.split(',')]);
		tagInput = '';
		if (next && next.join() !== tags.join()) {
			tags = next;
			change({ tags }, 0);
		}
	}
	function removeTag(tag: string) {
		tags = tags.filter((t) => t !== tag);
		change({ tags }, 0);
	}
	function togglePin() {
		pinned = !pinned;
		change({ pinned }, 0);
	}

	// --- Indirizzi ---

	const full = $derived(page.url.searchParams.has('full'));
	// l'elenco conserva ricerca e tag; lo schermo intero si attiva e disattiva con ?full=1
	const listQuery = $derived(editQuery(page.url.search, { full: null }));
	const fullHref = $derived(
		page.url.pathname + editQuery(page.url.search, { full: full ? null : '1' })
	);
</script>

<svelte:document onvisibilitychange={onVisibility} />
<svelte:window onbeforeunload={onBeforeUnload} />

<div class="flex min-h-dvh flex-col md:min-h-full">
	<header class="relative flex items-center gap-1 border-b border-volt py-1.5 pr-2 pl-1">
		<span class="absolute -bottom-px left-0 h-1 w-24 bg-volt" aria-hidden="true"></span>
		<a
			href="/note{listQuery}"
			aria-label="Torna all'elenco"
			class="flex size-11 items-center justify-center text-volt md:hidden"
		>
			<ChevronLeft size={24} strokeWidth={2.5} aria-hidden="true" />
		</a>
		<span class="flex-1 truncate pl-1 lbl font-semibold md:pl-3" aria-live="polite">
			{#if status === 'saved'}
				<span class="text-neon">■ Salvata</span>
			{:else if status === 'saving' || status === 'pending'}
				<span class="text-dim">Salvataggio…</span>
			{:else if status === 'offline'}
				<span class="text-soft">■ Sul dispositivo · in coda</span>
			{:else if status === 'error'}
				<button class="text-alert underline" onclick={() => outbox.retryNote(initial.id)}>
					Non salvata{queued?.error ? `: ${queued.error}` : ''} · Riprova
				</button>
			{:else}
				<span class="text-alert">Conflitto</span>
			{/if}
		</span>
		<a
			href={fullHref}
			data-sveltekit-replacestate
			data-sveltekit-noscroll
			class="hidden size-11 items-center justify-center text-volt md:flex"
			aria-label={full ? 'Esci dallo schermo intero' : 'Schermo intero'}
		>
			{#if full}<Minimize2 size={20} aria-hidden="true" />{:else}<Maximize2
					size={20}
					aria-hidden="true"
				/>{/if}
		</a>
		<button
			class="flex size-11 items-center justify-center text-volt"
			aria-label={pinned ? 'Togli dalle fissate' : 'Fissa in cima'}
			aria-pressed={pinned}
			onclick={togglePin}
		>
			{#if pinned}<PinOff size={20} aria-hidden="true" />{:else}<Pin
					size={20}
					aria-hidden="true"
				/>{/if}
		</button>
		<form method="POST" action="?/delete" data-offline onsubmit={deleteNote}>
			<button
				class="flex size-11 items-center justify-center text-alert"
				aria-label="Elimina nota"
				disabled={deleting}
			>
				<Trash2 size={20} aria-hidden="true" />
			</button>
		</form>
	</header>

	{#if conflict}
		<div
			role="alert"
			class="mx-4 mt-4 flex flex-col gap-2 panel-top px-3.5 py-3 text-alert md:mx-6"
		>
			<span class="lbl font-bold">Modificata su un altro dispositivo</span>
			<span class="text-[15px] text-ink">
				Questa nota è stata salvata altrove mentre la modificavi. Quale versione tieni?
			</span>
			<div class="flex flex-wrap gap-2">
				<button class="btn-outline" onclick={useTheirs}>Carica l'altra</button>
				<button class="btn-danger" onclick={keepMine}>Tieni la mia</button>
			</div>
		</div>
	{/if}

	<div
		class="mx-auto flex w-full flex-1 flex-col gap-3.5 px-5 pt-4 md:order-2 md:px-8 {full
			? 'max-w-3xl'
			: 'max-w-2xl'}"
	>
		<label for="note-title" class="sr-only">Titolo</label>
		<textarea
			id="note-title"
			bind:this={titleEl}
			bind:value={title}
			rows="1"
			maxlength="300"
			placeholder="Titolo"
			class="field-sizing-content resize-none border-0 bg-transparent p-0 text-[34px] leading-[0.95] font-bold tracking-tight text-volt uppercase placeholder:text-field focus:ring-0"
			oninput={() => change({ title })}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					editor?.commands.focus('start');
				}
			}}></textarea>

		<div class="flex flex-wrap items-center gap-2">
			<span class="relative inline-flex">
				<label class="chip text-neon focus-within:outline-2 focus-within:outline-neon">
					<CalendarDays size={14} aria-hidden="true" />
					{day
						? `${weekdayShort(day)} ${dayNumber(day)} ${monthShort(day)}`
						: 'Assegna a un giorno'}
					<input
						type="date"
						value={day ?? ''}
						onchange={(e) => setDay(e.currentTarget.value)}
						class="absolute inset-0 cursor-pointer opacity-0"
						aria-label="Giorno della nota"
					/>
				</label>
				{#if day}
					<button
						class="ml-1 flex size-8.5 items-center justify-center border border-field text-dim"
						aria-label="Togli il giorno"
						onclick={() => setDay(null)}
					>
						<X size={14} aria-hidden="true" />
					</button>
				{/if}
			</span>
			<span class="relative inline-flex">
				<label class="chip text-alert focus-within:outline-2 focus-within:outline-neon">
					<Bell size={14} aria-hidden="true" />
					{reminder ? reminderLabel(reminder) : 'Promemoria'}
					<input
						type="datetime-local"
						value={reminder ?? ''}
						min={`${today}T00:00`}
						onchange={(e) => setReminder(e.currentTarget.value || null)}
						class="absolute inset-0 cursor-pointer opacity-0"
						aria-label="Promemoria della nota"
					/>
				</label>
				{#if reminder}
					<button
						class="ml-1 flex size-8.5 items-center justify-center border border-field text-dim"
						aria-label="Togli il promemoria"
						onclick={() => setReminder(null)}
					>
						<X size={14} aria-hidden="true" />
					</button>
				{/if}
			</span>
			{#each tags as tag (tag)}
				<span class="chip pr-1 text-volt">
					#{tag}
					<button
						class="flex size-7 items-center justify-center"
						aria-label="Togli il tag {tag}"
						onclick={() => removeTag(tag)}
					>
						<X size={12} aria-hidden="true" />
					</button>
				</span>
			{/each}
			<label class="chip text-dim focus-within:text-volt">
				<span aria-hidden="true">+</span>
				<span class="sr-only">Aggiungi un tag</span>
				<input
					bind:value={tagInput}
					maxlength={MAX_TAG_LENGTH}
					placeholder="TAG"
					class="w-16 border-0 bg-transparent p-0 text-xs font-bold tracking-[1px] uppercase placeholder:text-dim focus:w-28 focus:ring-0"
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ',') {
							e.preventDefault();
							addTag();
						}
					}}
					onblur={() => tagInput.trim() && addTag()}
				/>
			</label>
		</div>

		<div bind:this={element} class="flex-1"></div>
	</div>

	<div
		class="sticky bottom-0 z-10 bg-volt pb-[env(safe-area-inset-bottom)] md:top-0 md:bottom-auto md:order-1 md:pb-0"
	>
		{#if linkOpen}
			<form class="flex gap-1 bg-void p-1.5" onsubmit={applyLink}>
				<label for="link-url" class="sr-only">Indirizzo del link</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					id="link-url"
					type="url"
					inputmode="url"
					bind:value={linkUrl}
					placeholder="https://…"
					class="input min-h-10 flex-1"
					autofocus
				/>
				<button class="btn-primary min-h-10 px-3">{linkUrl ? 'Applica' : 'Rimuovi'}</button>
				<button
					type="button"
					class="btn min-h-10 px-3"
					onclick={() => (linkOpen = false)}
					aria-label="Chiudi"
				>
					<X size={16} aria-hidden="true" />
				</button>
			</form>
		{/if}
		<div role="toolbar" aria-label="Formattazione" class="flex overflow-x-auto px-1 text-void">
			{#each TOOLS as tool (tool.label)}
				{@const active = is(tool.key, tool.attrs)}
				<button
					class="flex size-11 shrink-0 items-center justify-center text-lg font-bold {active
						? 'bg-void text-volt'
						: ''} {tool.key === 'italic' ? 'italic' : ''} {tool.key === 'underline'
						? 'underline'
						: ''}"
					aria-label={tool.label}
					aria-pressed={active}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => editor && tool.run(editor)}
				>
					{#if tool.icon}<tool.icon
							size={20}
							strokeWidth={2.5}
							aria-hidden="true"
						/>{:else}{tool.text}{/if}
				</button>
			{/each}
			<button
				class="flex size-11 shrink-0 items-center justify-center {is('link')
					? 'bg-void text-volt'
					: ''}"
				aria-label="Link"
				aria-pressed={is('link')}
				onmousedown={(e) => e.preventDefault()}
				onclick={openLink}
			>
				<Link2 size={20} strokeWidth={2.5} aria-hidden="true" />
			</button>
			<button
				class="flex size-11 shrink-0 items-center justify-center"
				aria-label="Inserisci una checklist"
				onmousedown={(e) => e.preventDefault()}
				onclick={insertChecklist}
			>
				<ListChecks size={20} strokeWidth={2.5} aria-hidden="true" />
			</button>
		</div>
	</div>
</div>
