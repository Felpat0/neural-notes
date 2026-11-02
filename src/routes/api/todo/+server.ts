import { error, json } from '@sveltejs/kit';
import { todayIn } from '#lib/format.ts';
import { isValidRepeat } from '#lib/repeat.ts';
import {
	MAX_TODO_LENGTH,
	checklistItems,
	createNoteChecklist,
	createTodos,
	deleteTodo,
	moveTodo,
	reorderTodos,
	restoreTodo,
	setTodoRepeat,
	setTodoTime,
	toggleTodo,
	updateTodoText
} from '#lib/server/todos.ts';
import type { RequestHandler } from './$types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_BATCH = 50;

const isDay = (v: unknown): v is string =>
	typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(v));
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

function cleanText(v: unknown) {
	if (typeof v !== 'string') error(400, 'Testo non valido');
	const text = v.replace(/\s+/g, ' ').trim();
	if (!text) error(400, 'Il todo è vuoto');
	if (text.length > MAX_TODO_LENGTH) error(400, 'Il todo è troppo lungo');
	return text;
}

function timeOrNull(v: unknown) {
	if (v === null || v === undefined || v === '') return null;
	if (typeof v !== 'string' || !TIME.test(v)) error(400, 'Ora non valida');
	return v;
}

/**
 * Un'unica rotta per le operazioni sui todo, chiamata dall'interfaccia senza ricaricare la
 * pagina (aggiornamento ottimistico): { op, ...dati }.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user!;
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body || typeof body.op !== 'string') error(400, 'Richiesta non valida');
	const today = todayIn(user.timezone);
	const notFound = () => error(404, 'Todo non trovato');

	switch (body.op) {
		case 'create': {
			if (!Array.isArray(body.texts) || !body.texts.length || body.texts.length > MAX_BATCH)
				error(400, 'Testi non validi');
			if (body.day !== undefined && !isDay(body.day)) error(400, 'Giorno non valido');
			if (body.checklistId !== undefined && !isId(body.checklistId)) error(400, 'Lista non valida');
			if (body.repeat != null && !isValidRepeat(body.repeat)) error(400, 'Ripetizione non valida');
			const result = await createTodos(
				user,
				{
					day: body.day as string | undefined,
					checklistId: body.checklistId as string | undefined,
					texts: body.texts.map(cleanText),
					time: timeOrNull(body.time),
					repeat: (body.repeat as string | null | undefined) ?? null
				},
				today
			);
			return result ? json(result) : notFound();
		}
		case 'text': {
			if (!isId(body.id)) error(400);
			return json({
				item: (await updateTodoText(user, body.id, cleanText(body.text))) ?? notFound()
			});
		}
		case 'toggle': {
			if (!isId(body.id) || typeof body.done !== 'boolean') error(400);
			return json({ item: (await toggleTodo(user, body.id, body.done)) ?? notFound() });
		}
		case 'list': {
			if (!isId(body.checklistId)) error(400);
			const items = (await checklistItems(user, [body.checklistId])).get(body.checklistId);
			return json({ items: items ?? [] });
		}
		case 'createChecklist': {
			if (!isId(body.noteId)) error(400);
			const checklistId = await createNoteChecklist(user, body.noteId);
			return checklistId ? json({ checklistId }) : error(404, 'Nota non trovata');
		}
		case 'moveMany': {
			if (
				!Array.isArray(body.ids) ||
				body.ids.length > 200 ||
				!body.ids.every(isId) ||
				!isDay(body.day)
			)
				error(400);
			const moved = [];
			for (const id of body.ids) {
				const result = await moveTodo(user, id, body.day);
				if (result?.item) moved.push(result.item);
			}
			return json({ items: moved });
		}
		case 'move': {
			if (!isId(body.id) || !isDay(body.day)) error(400);
			return json((await moveTodo(user, body.id, body.day)) ?? notFound());
		}
		case 'reorder': {
			if (
				!isId(body.checklistId) ||
				!Array.isArray(body.ids) ||
				body.ids.length > 500 ||
				!body.ids.every(isId)
			)
				error(400);
			if (!(await reorderTodos(user, body.checklistId, body.ids))) notFound();
			return json({ ok: true });
		}
		case 'delete': {
			if (!isId(body.id)) error(400);
			if (!(await deleteTodo(user, body.id))) notFound();
			return json({ ok: true });
		}
		case 'restore': {
			if (!isId(body.id)) error(400);
			return json({ item: (await restoreTodo(user, body.id)) ?? notFound() });
		}
		case 'repeat': {
			if (!isId(body.id) || (body.repeat !== null && !isValidRepeat(body.repeat))) error(400);
			return json({
				item:
					(await setTodoRepeat(user, body.id, body.repeat as string | null, today)) ?? notFound()
			});
		}
		case 'time': {
			if (!isId(body.id)) error(400);
			return json({
				item: (await setTodoTime(user, body.id, timeOrNull(body.time), today)) ?? notFound()
			});
		}
		default:
			error(400, 'Operazione sconosciuta');
	}
};
