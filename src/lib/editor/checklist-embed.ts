// Blocco "checklist" dell'editor delle note: nel documento c'è solo l'id della checklist,
// i todo stanno nel database e si spuntano anche dalla home. Il blocco mostra il componente
// Svelte della lista; dentro, tastiera e mouse sono suoi e non dell'editor.
import { Node, mergeAttributes } from '@tiptap/core';
import { mount, unmount } from 'svelte';
import NoteChecklist from '#lib/components/NoteChecklist.svelte';

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		checklistEmbed: {
			insertChecklist: (checklistId: string) => ReturnType;
		};
	}
}

export const ChecklistEmbed = Node.create<{ today: string }>({
	name: 'checklistEmbed',
	group: 'block',
	atom: true,
	selectable: true,
	draggable: false,

	addOptions() {
		return { today: '' };
	},

	addAttributes() {
		return {
			checklistId: {
				default: null,
				parseHTML: (el) => el.getAttribute('data-checklist'),
				renderHTML: (attrs) => ({ 'data-checklist': attrs.checklistId })
			}
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-checklist]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return ['div', mergeAttributes(HTMLAttributes)];
	},

	addCommands() {
		return {
			insertChecklist:
				(checklistId) =>
				({ commands }) =>
					commands.insertContent([
						{ type: this.name, attrs: { checklistId } },
						{ type: 'paragraph' }
					])
		};
	},

	addNodeView() {
		const { today } = this.options;
		return ({ node, editor, getPos }) => {
			const dom = document.createElement('div');
			dom.contentEditable = 'false';
			const component = mount(NoteChecklist, {
				target: dom,
				props: {
					checklistId: node.attrs.checklistId,
					today,
					// togliere il blocco non cancella la checklist: Ctrl+Z la rimette com'era
					onremove: () => {
						const pos = typeof getPos === 'function' ? getPos() : undefined;
						if (pos !== undefined)
							editor
								.chain()
								.focus()
								.deleteRange({ from: pos, to: pos + node.nodeSize })
								.run();
					}
				}
			});
			return {
				dom,
				stopEvent: () => true,
				ignoreMutation: () => true,
				update: (updated) =>
					updated.type.name === 'checklistEmbed' &&
					updated.attrs.checklistId === node.attrs.checklistId,
				destroy: () => unmount(component)
			};
		};
	}
});
