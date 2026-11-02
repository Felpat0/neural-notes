import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidRepeat, repeatLabel, repeatOptions, repeatsOn } from '#lib/repeat.ts';

test('giorni in cui vale una regola', () => {
	// 2026-11-02 è lunedì
	assert.equal(repeatsOn('daily', '2026-11-08'), true);
	assert.equal(repeatsOn('weekdays', '2026-11-06'), true); // venerdì
	assert.equal(repeatsOn('weekdays', '2026-11-07'), false); // sabato
	assert.equal(repeatsOn('weekly:1,4', '2026-11-02'), true);
	assert.equal(repeatsOn('weekly:1,4', '2026-11-05'), true);
	assert.equal(repeatsOn('weekly:1,4', '2026-11-03'), false);
	assert.equal(repeatsOn('weekly:7', '2026-11-08'), true); // domenica
	assert.equal(repeatsOn('monthly:15', '2026-11-15'), true);
	assert.equal(repeatsOn('monthly:15', '2026-11-16'), false);
});

test("il 31 cade sull'ultimo giorno dei mesi corti", () => {
	assert.equal(repeatsOn('monthly:31', '2026-11-30'), true);
	assert.equal(repeatsOn('monthly:31', '2027-02-28'), true);
	assert.equal(repeatsOn('monthly:31', '2028-02-29'), true);
	assert.equal(repeatsOn('monthly:31', '2028-02-28'), false);
	assert.equal(repeatsOn('monthly:31', '2026-12-31'), true);
});

test('regole valide e non valide', () => {
	for (const ok of ['daily', 'weekdays', 'weekly:1', 'weekly:1,3,5', 'monthly:1', 'monthly:31'])
		assert.equal(isValidRepeat(ok), true, ok);
	for (const bad of [
		'',
		'weekly:',
		'weekly:0',
		'weekly:8',
		'monthly:0',
		'monthly:32',
		'yearly',
		42
	])
		assert.equal(isValidRepeat(bad), false, String(bad));
	assert.equal(repeatsOn('nonsense', '2026-11-02'), false);
});

test('etichette e scelte del menu', () => {
	assert.equal(repeatLabel('weekly:1,4'), 'Ogni lunedì e giovedì');
	assert.equal(repeatLabel('weekly:1,3,5'), 'Ogni lunedì, mercoledì e venerdì');
	assert.equal(repeatLabel('monthly:15'), 'Ogni mese il 15');
	assert.deepEqual(
		repeatOptions('2026-11-05').map((o) => o.value),
		['daily', 'weekdays', 'weekly:4', 'monthly:5']
	);
});
