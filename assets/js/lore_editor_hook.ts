interface HookContext {
  el: HTMLElement;
  pushEvent: (event: string, payload: object) => void;
  handleEvent: (event: string, callback: (payload: any) => void) => void;
}

export const LoreEditorHook = {
  mounted(this: HookContext & Record<string, any>) {
    const editor = this.el.querySelector('[contenteditable]') as HTMLElement;
    if (!editor) return;

    this._editor = editor;

    // Bold button
    const boldBtn = this.el.querySelector('[data-action="bold"]');
    if (boldBtn) {
      boldBtn.addEventListener('mousedown', (e: Event) => {
        e.preventDefault();
        document.execCommand('bold');
      });
    }

    // Italic button
    const italicBtn = this.el.querySelector('[data-action="italic"]');
    if (italicBtn) {
      italicBtn.addEventListener('mousedown', (e: Event) => {
        e.preventDefault();
        document.execCommand('italic');
      });
    }

    // Keyboard shortcuts inside the editor
    editor.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        document.execCommand('bold');
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        document.execCommand('italic');
      }
      // Stop propagation so map keyboard shortcuts don't fire while editing
      e.stopPropagation();
    });

    // Auto-save on blur
    editor.addEventListener('blur', () => {
      this.pushEvent('save_lore_content', { content: editor.textContent ? editor.innerHTML : '' });
    });

    // Receive content updates from server (e.g. on panel open)
    this.handleEvent('set_lore_content', (data: { content: string }) => {
      if (this._editor && document.activeElement !== this._editor) {
        this._editor.textContent = '';
        if (data.content) {
          // Use DOM parser to safely set content (only allows inline formatting)
          const doc = new DOMParser().parseFromString(data.content, 'text/html');
          while (doc.body.firstChild) {
            this._editor.appendChild(doc.body.firstChild);
          }
        }
      }
    });
  },

  updated(this: HookContext & Record<string, any>) {
    // When LiveView re-renders, restore content from the data attribute
    const editor = this.el.querySelector('[contenteditable]') as HTMLElement;
    if (editor && this._editor !== editor) {
      this._editor = editor;
    }
    // Sync content from data attribute if editor isn't focused
    if (editor && document.activeElement !== editor) {
      const content = editor.dataset.content;
      if (content !== undefined && content !== null) {
        editor.textContent = '';
        if (content) {
          const doc = new DOMParser().parseFromString(content, 'text/html');
          while (doc.body.firstChild) {
            editor.appendChild(doc.body.firstChild);
          }
        }
      }
    }
  },
};
