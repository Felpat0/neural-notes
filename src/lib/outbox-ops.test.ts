import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	LOCAL_RULE,
	applyTodoOps,
	handledTodoIds,
	patchApplied,
	sameJson,
	type TodoOp
} from '#lib/outbox-ops.ts';
import type { TodoItem } from '#lib/todo-api.ts';

const item = (id: string, extra: Partial<TodoItem> = {}): TodoItem => ({
	id,
	text: id,
	done: false,
	ruleId: null,
	repeat: null,
	time: null,
	...extra
});
const ids = (rows: TodoItem[]) => rows.map((r) => r.id);
const dayList = { checklistId: 'c1', day: '2026-11-04' };

test('create: nella lista giusta, una volta sola', () => {
	const op: TodoOp = {
		op: 'create',
		ids: ['n1', 'n2'],
		texts: ['uno', 'due'],
		time: '09:00',
		repeat: 'daily',
		checklistId: 'c1'
	};
	const rows = applyTodoOps([item('a')], [op, op], dayList);
	assert.deepEqual(ids(rows), ['a', 'n1', 'n2']);
	assert.equal(rows[1].text, 'uno');
	assert.equal(rows[1].time, '09:00');
	assert.equal(rows[1].ruleId, LOCAL_RULE);
	assert.deepEqual(ids(applyTodoOps([], [op], { checklistId: 'c2', day: null })), []);
});

test('create per giorno: arriva nella lista di quel giorno', () => {
	const op: TodoOp = {
		op: 'create',
		ids: ['n1'],
		texts: ['x'],
		time: null,
		repeat: null,
		day: '2026-11-04'
	};
	assert.deepEqual(ids(applyTodoOps([], [op], dayList)), ['n1']);
	assert.deepEqual(ids(applyTodoOps([], [op], { checklistId: 'c9', day: '2026-11-05' })), []);
});

test('modifiche, eliminazione e ripristino', () => {
	const ops: TodoOp[] = [
		{ op: 'toggle', id: 'a', done: true },
		{ op: 'text', id: 'b', text: 'nuovo' },
		{ op: 'time', id: 'b', time: '10:30' },
		{ op: 'repeat', id: 'b', repeat: 'weekly:1' },
		{ op: 'delete', id: 'c' }
	];
	const rows = applyTodoOps([item('a'), item('b'), item('c')], ops, dayList);
	assert.deepEqual(ids(rows), ['a', 'b']);
	assert.equal(rows[0].done, true);
	assert.equal(rows[1].text, 'nuovo');
	assert.equal(rows[1].time, '10:30');
	assert.equal(rows[1].ruleId, LOCAL_RULE);

	const restore: TodoOp = { op: 'restore', id: 'c', checklistId: 'c1', at: 1, item: item('c') };
	const back = applyTodoOps(rows, [restore, restore], dayList);
	assert.deepEqual(ids(back), ['a', 'c', 'b']);
});

test('i dati originali non cambiano', () => {
	const original = [item('a')];
	applyTodoOps(original, [{ op: 'toggle', id: 'a', done: true }], dayList);
	assert.equal(original[0].done, false);
});

test('move: esce da una lista ed entra nel giorno di arrivo, con il nuovo id se ricorrente', () => {
	const plain: TodoOp = { op: 'move', id: 'a', day: '2026-11-05', item: item('a', { done: true }) };
	const tomorrow = { checklistId: 'c2', day: '2026-11-05' };
	assert.deepEqual(ids(applyTodoOps([item('a'), item('b')], [plain], dayList)), ['b']);
	const arrived = applyTodoOps([], [plain], tomorrow);
	assert.deepEqual(ids(arrived), ['a']);
	assert.equal(arrived[0].done, false);

	const recurring: TodoOp = {
		op: 'move',
		id: 'r',
		day: '2026-11-05',
		newId: 'r2',
		item: item('r', { ruleId: 'rule', repeat: 'daily' })
	};
	const [copy] = applyTodoOps([], [recurring], tomorrow);
	assert.equal(copy.id, 'r2');
	assert.equal(copy.ruleId, null);
	assert.equal(copy.repeat, null);
});

test('moveMany: porta i todo in sospeso a oggi', () => {
	const op: TodoOp = {
		op: 'moveMany',
		ids: ['x', 'y'],
		newIds: [null, 'y2'],
		day: '2026-11-04',
		items: [item('x'), item('y', { ruleId: 'rule' })]
	};
	assert.deepEqual(ids(applyTodoOps([item('a')], [op, op], dayList)), ['a', 'x', 'y2']);
	assert.deepEqual([...handledTodoIds([op])], ['x', 'y']);
});

test('reorder: come sul server, chi manca resta dopo', () => {
	const op: TodoOp = { op: 'reorder', checklistId: 'c1', ids: ['c', 'a'] };
	const rows = applyTodoOps([item('a'), item('b'), item('c'), item('d')], [op], dayList);
	assert.deepEqual(ids(rows), ['c', 'a', 'b', 'd']);
});

test('handledTodoIds: spostati, eliminati, fatti', () => {
	const handled = handledTodoIds([
		{ op: 'move', id: 'a', day: '2026-11-04', item: item('a') },
		{ op: 'delete', id: 'b' },
		{ op: 'toggle', id: 'c', done: true },
		{ op: 'toggle', id: 'd', done: false }
	]);
	assert.deepEqual([...handled].sort(), ['a', 'b', 'c']);
});

test('sameJson ignora l’ordine delle chiavi', () => {
	assert.ok(sameJson({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }));
	assert.ok(!sameJson({ a: 1 }, { a: 2 }));
	assert.ok(!sameJson([1, 2], [2, 1]));
	assert.ok(!sameJson({ a: 1 }, { a: 1, b: 2 }));
	assert.ok(sameJson({ a: 1, b: undefined }, { a: 1 }));
});

test('patchApplied: la patch è già nella versione del server', () => {
	const current = { title: 'T', tags: ['x'], content: { type: 'doc', content: [] }, pinned: false };
	assert.ok(patchApplied({ title: 'T', content: { content: [], type: 'doc' } }, current));
	assert.ok(!patchApplied({ title: 'Altro' }, current));
});
