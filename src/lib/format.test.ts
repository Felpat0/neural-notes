import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeIn, todayIn, weekOf, zonedDateTime } from '#lib/format.ts';

test("giorno e ora locali → istante, anche con l'ora legale", () => {
	// inverno: Roma = UTC+1
	assert.equal(
		zonedDateTime('2026-11-02', '15:00', 'Europe/Rome').toISOString(),
		'2026-11-02T14:00:00.000Z'
	);
	// estate: Roma = UTC+2
	assert.equal(
		zonedDateTime('2026-07-10', '09:30', 'Europe/Rome').toISOString(),
		'2026-07-10T07:30:00.000Z'
	);
	assert.equal(
		zonedDateTime('2026-11-02', '08:00', 'Asia/Tokyo').toISOString(),
		'2026-11-01T23:00:00.000Z'
	);
	assert.equal(timeIn('2026-11-02T14:00:00Z', 'Europe/Rome'), '15:00');
});

test("oggi nel fuso dell'utente", () => {
	const late = new Date('2026-11-02T23:30:00Z');
	assert.equal(todayIn('Europe/Rome', late), '2026-11-03');
	assert.equal(todayIn('America/New_York', late), '2026-11-02');
});

test('settimana da lunedì a domenica', () => {
	assert.deepEqual(weekOf('2026-11-05'), [
		'2026-11-02',
		'2026-11-03',
		'2026-11-04',
		'2026-11-05',
		'2026-11-06',
		'2026-11-07',
		'2026-11-08'
	]);
});
