<script lang="ts">
	import AuthShell from '#lib/components/AuthShell.svelte';
</script>

<svelte:head><title>Privacy · NEURAL//NOTES</title></svelte:head>

<!-- Informativa pubblica (richiesta da Google per la schermata di consenso OAuth). -->
<AuthShell back={{ href: '/', label: 'Torna all’app' }}>
	<article class="flex flex-col gap-4 text-[15px] leading-relaxed">
		<h1 class="text-[26px] font-bold text-volt uppercase">Privacy</h1>
		<p>
			NEURAL//NOTES è un’app personale di note, todo e promemoria. I dati inseriti restano nel
			database dell’app e non vengono venduti né condivisi con terzi.
		</p>
		<h2 class="lbl font-bold text-volt">Accesso con Google</h2>
		<p>Con “Continua con Google” l’app riceve solo nome, email e identificativo dell’account.</p>
		<h2 class="lbl font-bold text-volt">Google Calendar</h2>
		<p>Se colleghi Google Calendar dal Profilo, l’app:</p>
		<ul class="list-disc pl-5">
			<li>crea un calendario “NEURAL//NOTES” e vi scrive gli eventi di todo e note;</li>
			<li>legge le modifiche fatte a quel calendario per riportarle nell’app;</li>
			<li>
				legge l’elenco dei calendari e gli eventi di quelli che scegli, per trasformarli in todo.
			</li>
		</ul>
		<p>
			I token di accesso sono salvati cifrati. Non viene scritto nulla negli altri calendari. L’uso
			dei dati ricevuti dalle API di Google rispetta le
			<a href="https://developers.google.com/terms/api-services-user-data-policy" class="btn-link"
				>norme sui dati utente dei servizi API di Google</a
			>, compresi i requisiti di uso limitato.
		</p>
		<h2 class="lbl font-bold text-volt">Scollegamento ed eliminazione</h2>
		<p>
			Scollegando Google Calendar dal Profilo l’accesso viene revocato e gli eventi copiati vengono
			cancellati dall’app. Puoi anche revocare l’accesso da
			<a href="https://myaccount.google.com/permissions" class="btn-link"
				>myaccount.google.com/permissions</a
			>.
		</p>
	</article>
</AuthShell>
