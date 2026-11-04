import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	eventIdFor,
	eventStart,
	firstOccurrence,
	noteEvent,
	parseTodoSummary,
	readIdToken,
	rrule,
	ruleEvent,
	todoEvent
} from '#lib/google-calendar.ts';

const c = { appUrl: 'https://app.test', timeZone: 'Europe/Rome' };

test('id degli eventi: stabili e in base32hex', () => {
	const id = eventIdFor('todo', 'abc');
	assert.equal(id, eventIdFor('todo', 'abc'));
	assert.notEqual(id, eventIdFor('note', 'abc'));
	assert.match(id, /^[0-9a-v]{5,1024}$/);
});

test('RRULE dalle regole di ripetizione', () => {
	assert.equal(rrule('daily'), 'RRULE:FREQ=DAILY');
	assert.equal(rrule('weekdays'), 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
	assert.equal(rrule('weekly:1,4'), 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH');
	assert.equal(rrule('monthly:5'), 'RRULE:FREQ=MONTHLY;BYMONTHDAY=5');
	assert.equal(rrule('monthly:31'), 'RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
	assert.equal(rrule('monthly:29'), 'RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1');
	assert.equal(rrule('daily', { day: '2026-12-01' }), 'RRULE:FREQ=DAILY;UNTIL=20261201');
	assert.equal(
		rrule('daily', { day: '2026-12-01', utc: new Date('2026-12-01T22:59:00Z') }),
		'RRULE:FREQ=DAILY;UNTIL=20261201T225900Z'
	);
	assert.equal(rrule('ogni tanto'), null);
});

test('prima occorrenza', () => {
	assert.equal(firstOccurrence('weekly:3', '2026-11-02'), '2026-11-04');
	assert.equal(firstOccurrence('daily', '2026-11-02'), '2026-11-02');
});

test('evento di un todo', () => {
	const timed = todoEvent(
		{ id: 't1', text: 'Chiamare', done: false, day: '2026-11-02', time: '23:45' },
		c
	);
	assert.deepEqual(timed.start, { dateTime: '2026-11-02T23:45:00', timeZone: 'Europe/Rome' });
	assert.deepEqual(timed.end, { dateTime: '2026-11-03T00:15:00', timeZone: 'Europe/Rome' });
	assert.equal(timed.summary, 'Chiamare');
	const done = todoEvent({ id: 't1', text: 'Pane', done: true, day: '2026-11-02', time: null }, c);
	assert.equal(done.summary, '✓ Pane');
	assert.deepEqual(done.start, { date: '2026-11-02' });
	assert.deepEqual(done.end, { date: '2026-11-03' });
	assert.equal(done.extendedProperties.private.nnId, 't1');
});

test('evento di un todo ricorrente', () => {
	const rule = {
		id: 'r1',
		text: 'Vitamine',
		repeat: 'weekly:3',
		startsOn: '2026-11-02',
		endsOn: null,
		time: '08:00',
		skipped: ['2026-11-11', '2026-10-01']
	};
	const ev = ruleEvent(rule, c)!;
	assert.deepEqual(ev.start, { dateTime: '2026-11-04T08:00:00', timeZone: 'Europe/Rome' });
	assert.deepEqual(ev.recurrence, [
		'RRULE:FREQ=WEEKLY;BYDAY=WE',
		'EXDATE;TZID=Europe/Rome:20261111T080000'
	]);
	const untimed = ruleEvent({ ...rule, time: null, endsOn: '2026-12-31' }, c)!;
	assert.deepEqual(untimed.recurrence, [
		'RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20261231',
		'EXDATE;VALUE=DATE:20261111'
	]);
	// interrotta prima della prima occorrenza: nessun evento
	assert.equal(ruleEvent({ ...rule, endsOn: '2026-11-03' }, c), null);
});

test('evento di una nota', () => {
	const note = { id: 'n1', title: '', text: 'Ciao', day: '2026-11-02', at: null };
	const allDay = noteEvent(note, c)!;
	assert.equal(allDay.summary, 'Nota');
	assert.deepEqual(allDay.start, { date: '2026-11-02' });
	assert.equal(allDay.description, 'Ciao\n\nhttps://app.test/note/n1');
	const timed = noteEvent({ ...note, at: '2026-11-05T09:30' }, c)!;
	assert.deepEqual(timed.start, { dateTime: '2026-11-05T09:30:00', timeZone: 'Europe/Rome' });
	assert.equal(noteEvent({ ...note, day: null }, c), null);
});

test("inizio di un evento nel fuso dell'utente", () => {
	assert.deepEqual(eventStart({ dateTime: '2026-11-02T23:30:00Z' }, 'Europe/Rome'), {
		day: '2026-11-03',
		time: '00:30'
	});
	assert.deepEqual(eventStart({ date: '2026-11-02' }, 'Europe/Rome'), {
		day: '2026-11-02',
		time: null
	});
});

test('titolo di un todo letto da Google', () => {
	assert.deepEqual(parseTodoSummary('✓  Pane  e latte'), { done: true, text: 'Pane e latte' });
	assert.deepEqual(parseTodoSummary('Pane'), { done: false, text: 'Pane' });
});

test('id_token di Google', () => {
	const token = (payload: object) =>
		`x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;
	const ok = {
		iss: 'https://accounts.google.com',
		aud: 'cid',
		sub: '123',
		email: 'a@b.it',
		email_verified: true,
		exp: Date.now() / 1000 + 60
	};
	assert.equal(readIdToken(token(ok), 'cid')?.sub, '123');
	assert.equal(readIdToken(token(ok), 'altro'), null);
	assert.equal(readIdToken(token({ ...ok, iss: 'evil' }), 'cid'), null);
	assert.equal(readIdToken(token({ ...ok, exp: 1 }), 'cid'), null);
	assert.equal(readIdToken('rotto', 'cid'), null);
});
