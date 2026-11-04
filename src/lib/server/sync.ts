import { sql } from 'drizzle-orm';
import { db, schema as s } from './db/index.ts';

/**
 * Impronta dei dati dell'utente: cambia quando cambia qualcosa che le pagine mostrano (note, todo,
 * checklist, ricorrenze, promemoria, eventi di Google, profilo). Il client la confronta a
 * intervalli per accorgersi delle modifiche fatte da un altro dispositivo (lib/sync.svelte.ts).
 * Note e todo hanno updated_at (e non si eliminano davvero: deleted_at); le tabelle senza, che
 * sono piccole, entrano con il loro contenuto.
 */
export async function fingerprint(userId: string): Promise<string> {
	const { rows } = await db.execute<{ v: string }>(sql`
		select md5(concat_ws('|',
			(select concat(max(${s.note.updatedAt}), ':', count(*)) from ${s.note}
				where ${s.note.userId} = ${userId}),
			(select concat(max(${s.todo.updatedAt}), ':', count(*)) from ${s.todo}
				join ${s.checklist} on ${s.checklist.id} = ${s.todo.checklistId}
				where ${s.checklist.userId} = ${userId}),
			(select count(*) from ${s.checklist} where ${s.checklist.userId} = ${userId}),
			(select md5(string_agg(concat_ws(',', ${s.todoRule.id}, ${s.todoRule.text},
					${s.todoRule.repeat}, ${s.todoRule.startsOn}, ${s.todoRule.endsOn},
					${s.todoRule.remindTime}), ';' order by ${s.todoRule.id}))
				from ${s.todoRule} where ${s.todoRule.userId} = ${userId}),
			(select md5(string_agg(concat_ws(',', ${s.noteRule.id}, ${s.noteRule.repeat},
					${s.noteRule.startsOn}, ${s.noteRule.endsOn}, ${s.noteRule.remindTime}),
					';' order by ${s.noteRule.id}))
				from ${s.noteRule} where ${s.noteRule.userId} = ${userId}),
			(select md5(string_agg(concat_ws(',', ${s.reminder.id}, ${s.reminder.fireAt},
					${s.reminder.title}), ';' order by ${s.reminder.id}))
				from ${s.reminder} where ${s.reminder.userId} = ${userId} and ${s.reminder.sentAt} is null),
			(select md5(string_agg(concat_ws(',', ${s.googleEvent.calendarId}, ${s.googleEvent.eventId},
					${s.googleEvent.title}, ${s.googleEvent.location}, ${s.googleEvent.start},
					${s.googleEvent.end}, ${s.googleEvent.startDay}, ${s.googleEvent.endDay}),
					';' order by ${s.googleEvent.calendarId}, ${s.googleEvent.eventId}))
				from ${s.googleEvent} where ${s.googleEvent.userId} = ${userId}),
			(select ${s.user.updatedAt} from ${s.user} where ${s.user.id} = ${userId})
		)) as v`);
	return rows[0].v;
}
