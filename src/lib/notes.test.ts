import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistIdsIn, cleanTags, groupNotes, type NoteSummary } from '#lib/notes.ts';

const note = (id: string, updatedAt: string, extra: Partial<NoteSummary> = {}): NoteSummary => ({
	id,
	title: id,
	preview: '',
	day: null,
	tags: [],
	pinned: false,
	updatedAt,
	...extra
});

test('gruppi: In arrivo, Oggi, Questo mese, poi i mesi', () => {
	const now = new Date('2026-11-02T10:00:00Z');
	const groups = groupNotes(
		[
			note('oggi', '2026-11-02T08:00:00Z'),
			note('ieri', '2026-11-01T08:00:00Z'),
			note('ottobre', '2026-10-20T08:00:00Z'),
			note('settembre', '2026-09-03T08:00:00Z'),
			note('futura', '2026-10-01T08:00:00Z', { day: '2026-11-10' }),
			note('fissata', '2026-10-01T08:00:00Z', { pinned: true })
		],
		'Europe/Rome',
		now
	);
	assert.deepEqual(
		groups.map((g) => [g.label, g.notes.map((n) => n.id)]),
		[
			['In arrivo', ['futura']],
			['Oggi', ['oggi']],
			['Questo mese', ['ieri']],
			['Ottobre 2026', ['fissata', 'ottobre']],
			['Settembre 2026', ['settembre']]
		]
	);
});

test("il giorno di modifica è quello del fuso dell'utente", () => {
	// 23:30 UTC del 1° novembre = 00:30 del 2 a Roma
	const groups = groupNotes(
		[note('notte', '2026-11-01T23:30:00Z')],
		'Europe/Rome',
		new Date('2026-11-02T10:00:00Z')
	);
	assert.equal(groups[0].label, 'Oggi');
});

test('checklist nel testo di una nota', () => {
	const doc = {
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [{ type: 'text', text: 'ciao' }] },
			{ type: 'checklistEmbed', attrs: { checklistId: 'a' } },
			{ type: 'blockquote', content: [{ type: 'checklistEmbed', attrs: { checklistId: 'b' } }] },
			{ type: 'checklistEmbed', attrs: { checklistId: 'a' } }
		]
	};
	assert.deepEqual(checklistIdsIn(doc), ['a', 'b']);
	assert.deepEqual(checklistIdsIn(null), []);
	assert.deepEqual(checklistIdsIn({ type: 'checklistEmbed', attrs: { checklistId: 3 } }), []);
});

test('tag puliti', () => {
	assert.deepEqual(cleanTags(['#Lavoro', 'lavoro', ' casa nuova ', '']), ['lavoro', 'casa-nuova']);
	assert.equal(cleanTags('lavoro'), null);
	assert.equal(cleanTags([1]), null);
});
