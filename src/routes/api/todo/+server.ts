import { error, json } from '@sveltejs/kit';
import { todayIn } from '#lib/format.ts';
import { isValidRepeat } from '#lib/repeat.ts';
import { queueGoogle } from '#lib/server/google/calendar.ts';
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
/** Id scelto dal client per un oggetto nuovo (anche offline): un UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isNewId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
/** Id nuovo facoltativo: assente o un UUID. */
function newIdOrNone(v: unknown) {
	if (v === undefined || v === null) return undefined;
	if (!isNewId(v)) error(400, 'Id non valido');
	return v;
}

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
	// i todo cambiati vanno anche in Google Calendar (se collegato)
	const sync = (...ids: (string | null | undefined)[]) =>
		queueGoogle(
			user.id,
			ids.filter((id): id is string => !!id).map((id) => ['todo', id])
		);

	switch (body.op) {
		case 'create': {
			if (!Array.isArray(body.texts) || !body.texts.length || body.texts.length > MAX_BATCH)
				error(400, 'Testi non validi');
			if (body.day !== undefined && !isDay(body.day)) error(400, 'Giorno non valido');
			if (body.checklistId !== undefined && !isId(body.checklistId)) error(400, 'Lista non valida');
			if (body.repeat != null && !isValidRepeat(body.repeat)) error(400, 'Ripetizione non valida');
			if (
				body.ids !== undefined &&
				(!Array.isArray(body.ids) ||
					body.ids.length !== body.texts.length ||
					!body.ids.every(isNewId) ||
					new Set(body.ids).size !== body.ids.length)
			)
				error(400, 'Id non validi');
			const result = await createTodos(
				user,
				{
					day: body.day as string | undefined,
					checklistId: body.checklistId as string | undefined,
					ids: body.ids as string[] | undefined,
					texts: body.texts.map(cleanText),
					time: timeOrNull(body.time),
					repeat: (body.repeat as string | null | undefined) ?? null
				},
				today
			);
			if (!result) notFound();
			await sync(...result!.items.map((i) => i.id));
			return json(result);
		}
		case 'text': {
			if (!isId(body.id)) error(400);
			const item = (await updateTodoText(user, body.id, cleanText(body.text))) ?? notFound();
			await sync(body.id);
			return json({ item });
		}
		case 'toggle': {
			if (!isId(body.id) || typeof body.done !== 'boolean') error(400);
			const item = (await toggleTodo(user, body.id, body.done)) ?? notFound();
			await sync(body.id);
			return json({ item });
		}
		case 'list': {
			if (!isId(body.checklistId)) error(400);
			const items = (await checklistItems(user, [body.checklistId])).get(body.checklistId);
			return json({ items: items ?? [] });
		}
		case 'createChecklist': {
			if (!isId(body.noteId)) error(400);
			const checklistId = await createNoteChecklist(user, body.noteId, newIdOrNone(body.id));
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
			// id nuovi per le occorrenze dei ricorrenti, nello stesso ordine (facoltativi)
			const newIds = body.newIds === undefined ? [] : body.newIds;
			if (
				!Array.isArray(newIds) ||
				(newIds.length && newIds.length !== body.ids.length) ||
				!newIds.every((v) => v === null || isNewId(v))
			)
				error(400);
			const moved = [];
			for (const [i, id] of body.ids.entries()) {
				const result = await moveTodo(user, id, body.day, newIds[i] ?? undefined);
				if (result?.item) moved.push(result.item);
			}
			await sync(...body.ids, ...moved.map((i) => i.id));
			return json({ items: moved });
		}
		case 'move': {
			if (!isId(body.id) || !isDay(body.day)) error(400);
			const result =
				(await moveTodo(user, body.id, body.day, newIdOrNone(body.newId))) ?? notFound();
			await sync(body.id, result.item?.id);
			return json(result);
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
			await sync(body.id);
			return json({ ok: true });
		}
		case 'restore': {
			if (!isId(body.id)) error(400);
			const item = (await restoreTodo(user, body.id)) ?? notFound();
			await sync(body.id);
			return json({ item });
		}
		case 'repeat': {
			if (!isId(body.id) || (body.repeat !== null && !isValidRepeat(body.repeat))) error(400);
			const item =
				(await setTodoRepeat(user, body.id, body.repeat as string | null, today)) ?? notFound();
			await sync(body.id);
			return json({ item });
		}
		case 'time': {
			if (!isId(body.id)) error(400);
			const item = (await setTodoTime(user, body.id, timeOrNull(body.time), today)) ?? notFound();
			await sync(body.id);
			return json({ item });
		}
		default:
			error(400, 'Operazione sconosciuta');
	}
};
