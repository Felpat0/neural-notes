import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickParse } from '#lib/quick-parse.ts';

const TODAY = '2026-11-02'; // lunedì

const pick = (input: string, disabled: ('day' | 'time' | 'repeat')[] = []) => {
	const { text, day, time, repeat } = quickParse(input, TODAY, disabled);
	return { text, day, time, repeat };
};

test('giorno e ora', () => {
	assert.deepEqual(pick('Chiamare Marco domani 15:00'), {
		text: 'Chiamare Marco',
		day: '2026-11-03',
		time: '15:00',
		repeat: null
	});
	assert.deepEqual(pick('dentista dopodomani alle 9'), {
		text: 'dentista',
		day: '2026-11-04',
		time: '09:00',
		repeat: null
	});
	assert.equal(pick('pagare bolletta oggi').day, TODAY);
	assert.equal(pick("riunione all'11").time, '11:00');
	assert.equal(pick('treno ore 7.45').time, '07:45');
});

test('giorni della settimana: il prossimo, mai oggi', () => {
	assert.equal(pick('palestra giovedì').day, '2026-11-05');
	assert.equal(pick('palestra giovedi').day, '2026-11-05');
	assert.equal(pick('spesa sab').day, '2026-11-07');
	assert.equal(pick('call lunedì').day, '2026-11-09');
	assert.equal(pick('call il lunedì').text, 'call');
});

test('date', () => {
	assert.equal(pick('rinnovo 15/11').day, '2026-11-15');
	assert.equal(pick('rinnovo 15/11/27').day, '2027-11-15');
	// senza anno, una data passata è dell'anno prossimo
	assert.equal(pick('regali 10/01').day, '2027-01-10');
	assert.equal(pick('nulla 31/02').day, null);
});

test('ripetizioni', () => {
	assert.deepEqual(pick('pianificare settimana ogni lunedì'), {
		text: 'pianificare settimana',
		day: null,
		time: null,
		repeat: 'weekly:1'
	});
	assert.equal(pick('allenamento ogni lunedì e giovedì').repeat, 'weekly:1,4');
	assert.equal(pick('allenamento ogni lun, mer e ven').repeat, 'weekly:1,3,5');
	assert.equal(pick('vitamine ogni giorno alle 8').repeat, 'daily');
	assert.equal(pick('vitamine ogni giorno alle 8').time, '08:00');
	assert.equal(pick('standup nei giorni feriali').repeat, 'weekdays');
	assert.equal(pick('affitto ogni mese il 5').repeat, 'monthly:5');
	assert.equal(pick('affitto ogni mese').repeat, 'monthly:2');
});

test('niente falsi riconoscimenti dentro le parole', () => {
	assert.deepEqual(pick('comprare crema solare'), {
		text: 'comprare crema solare',
		day: null,
		time: null,
		repeat: null
	});
	assert.equal(pick('mare con Luca').day, null);
	assert.equal(pick('leggere Domanda di lavoro').day, null);
});

test("chip tolto: il testo resta com'è", () => {
	assert.deepEqual(pick('chiamare domani', ['day']), {
		text: 'chiamare domani',
		day: null,
		time: null,
		repeat: null
	});
});

test('solo la data: il testo resta tutto', () => {
	assert.equal(pick('domani').text, 'domani');
});

test('posizione dei token, per evidenziarli', () => {
	const { tokens } = quickParse('Chiamare Marco domani 15:00', TODAY);
	assert.deepEqual(
		tokens.map((t) => [t.kind, t.label]),
		[
			['day', 'Domani'],
			['time', '15:00']
		]
	);
});
