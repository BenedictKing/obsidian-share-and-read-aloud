import {
  Editor,
  MarkdownFileInfo,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  Plugin,
  TFile,
  TextAreaComponent,
} from "obsidian";

const PLUGIN_NAME = "Share Clean Text";

function normalizeMarkdown(input: string): string {
  let text = input || "";

  text = text.replace(/^---\n[\s\S]*?\n---\n?/m, "");
  text = text.replace(/<!--([\s\S]*?)-->/g, "");
  text = text.replace(/%%([\s\S]*?)%%/g, "");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/^~~~[\s\S]*?^~~~\s*$/gm, "");
  text = text.replace(/^\$\$[\s\S]*?^\$\$\s*$/gm, "");
  text = text.replace(/\$[^\n$]+\$/g, "");
  text = text.replace(/^\|.*\|$/gm, "");
  text = text.replace(/^\|[\s\-|:]+\|$/gm, "");
  text = text.replace(/^\[\^[^\]]+\]:\s*.*$/gm, "");
  text = text.replace(/\[\^[^\]]+\]/g, "");

  const lines = text.split("\n");
  let inCallout = false;
  text = lines
    .map((line) => {
      if (/^>\s*\[![^\]]*\]\s*/.test(line)) {
        inCallout = true;
        return line.replace(/^>\s*\[![^\]]*\]\s*/, "");
      }
      if (inCallout && /^>\s?/.test(line)) {
        return line.replace(/^>\s?/, "");
      }
      if (inCallout && line.trim() !== "") {
        inCallout = false;
      }
      return line;
    })
    .join("\n");

  text = text.replace(/!\[\[([^\]]+)\]\]/g, "");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/https?:\/\/[^\s)]+/g, "");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/`([^`]*)`/g, "$1");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/==([^=]+)==/g, "$1");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s{0,3}(#{1,6})\s+/gm, "");
  text = text.replace(/^\s*([-+*])\s+/gm, "");
  text = text.replace(/^\s*\d+[.)]\s+/gm, "");
  text = text.replace(/^(?:[-*_]\s*){3,}$/gm, "");
  text = text.replace(/\{>>.*?<<\}/g, "");
  text = text.replace(/\[\s*@[^\]]+\]/g, "");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

class TextPreviewModal extends Modal {
  private readonly text: string;

  constructor(app: Plugin["app"], text: string) {
    super(app);
    this.text = text;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Cleaned text" });
    contentEl.createEl("p", {
      text: "Automatic share/copy is unavailable in this environment. You can copy the cleaned text manually below.",
    });

    const textArea = new TextAreaComponent(contentEl);
    textArea.setValue(this.text);
    textArea.inputEl.readOnly = true;
    textArea.inputEl.rows = 16;
    textArea.inputEl.style.width = "100%";
    textArea.inputEl.select();
  }

  onClose() {
    this.contentEl.empty();
  }
}

export default class ShareCleanTextPlugin extends Plugin {
  async onload() {
    this.addRibbonIcon("share", "Share cleaned current note", () => {
      void this.shareCurrentNote();
    });

    this.addCommand({
      id: "share-cleaned-current-note",
      name: "Share cleaned current note",
      callback: async () => {
        await this.shareCurrentNote();
      },
    });

    this.addCommand({
      id: "copy-cleaned-current-note",
      name: "Copy cleaned current note",
      callback: async () => {
        await this.copyCurrentNote();
      },
    });

    this.addCommand({
      id: "share-cleaned-selected-text",
      name: "Share cleaned selected text",
      editorCheckCallback: (checking, editor) => {
        const hasSelection = editor.getSelection().trim().length > 0;
        if (!hasSelection) return false;
        if (!checking) {
          void this.shareSelection(editor);
        }
        return true;
      },
    });

    this.addCommand({
      id: "copy-cleaned-selected-text",
      name: "Copy cleaned selected text",
      editorCheckCallback: (checking, editor) => {
        const hasSelection = editor.getSelection().trim().length > 0;
        if (!hasSelection) return false;
        if (!checking) {
          void this.copySelection(editor);
        }
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
        const selectedText = editor.getSelection().trim();
        if (!selectedText) return;

        menu.addItem((item) => {
          item
            .setTitle("Share cleaned selection")
            .setIcon("share")
            .onClick(() => {
              void this.shareSelection(editor);
            });
        });

        menu.addItem((item) => {
          item
            .setTitle("Copy cleaned selection")
            .setIcon("copy")
            .onClick(() => {
              void this.copySelection(editor);
            });
        });
      })
    );
  }

  private async shareSelection(editor: Editor) {
    const cleaned = normalizeMarkdown(editor.getSelection());
    await this.deliverText(cleaned, "share", "selection");
  }

  private async copySelection(editor: Editor) {
    const cleaned = normalizeMarkdown(editor.getSelection());
    await this.deliverText(cleaned, "copy", "selection");
  }

  private async shareCurrentNote() {
    const cleaned = await this.getPreparedCurrentNoteContent();
    await this.deliverText(cleaned, "share", "note");
  }

  private async copyCurrentNote() {
    const cleaned = await this.getPreparedCurrentNoteContent();
    await this.deliverText(cleaned, "copy", "note");
  }

  private async getPreparedCurrentNoteContent(): Promise<string> {
    const { content, file } = await this.getCurrentNoteContext();
    const cleaned = normalizeMarkdown(content);
    return this.prependFrontmatterMetadata(file, cleaned);
  }

  private async getCurrentNoteContext(): Promise<{ content: string; file: TFile }> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      throw new Error("No active Markdown view.");
    }

    const file = this.getActiveMarkdownFile(activeView);
    if (!file) {
      throw new Error("No active Markdown file.");
    }

    const editor = activeView.editor;
    if (editor) {
      return { content: editor.getValue(), file };
    }

    return {
      content: await this.app.vault.cachedRead(file),
      file,
    };
  }

  private prependFrontmatterMetadata(file: TFile, body: string): string {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as
      | Record<string, unknown>
      | undefined;
    const title = this.getFrontmatterText(frontmatter, "title") ?? file.basename;
    const description = this.getFrontmatterText(frontmatter, "description");
    const parts = [title, description, body].filter(
      (part): part is string => Boolean(part && part.trim())
    );
    return parts.join("\n\n").trim();
  }

  private getFrontmatterText(
    frontmatter: Record<string, unknown> | undefined,
    key: "title" | "description"
  ): string | null {
    const value = frontmatter?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private getActiveMarkdownFile(view?: MarkdownView | MarkdownFileInfo | null): TFile | null {
    const file = view?.file ?? this.app.workspace.getActiveFile();
    return file instanceof TFile ? file : null;
  }

  private async deliverText(text: string, mode: "share" | "copy", scope: "selection" | "note") {
    if (!text.trim()) {
      new Notice(`No readable ${scope} content found.`);
      return;
    }

    if (mode === "copy") {
      const copied = await this.copyToClipboard(text);
      if (copied) {
        new Notice(`Copied cleaned ${scope} text.`);
      } else {
        this.openPreview(text);
      }
      return;
    }

    const shared = await this.shareText(text);
    if (shared === "shared") {
      new Notice(`Shared cleaned ${scope} text.`);
      return;
    }

    if (shared === "cancelled") {
      new Notice("Share cancelled.");
      return;
    }

    const copied = await this.copyToClipboard(text);
    if (copied) {
      new Notice(this.buildFallbackNotice(mode, scope));
      return;
    }

    this.openPreview(text);
  }

  private async shareText(text: string): Promise<"shared" | "cancelled" | "unavailable"> {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return "unavailable";
    }

    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (this.isAbortError(error)) {
        return "cancelled";
      }
      console.warn(`${PLUGIN_NAME}: share failed`, error);
      return "unavailable";
    }
  }

  private async copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn(`${PLUGIN_NAME}: clipboard write failed`, error);
      return false;
    }
  }

  private buildFallbackNotice(mode: "share" | "copy", scope: "selection" | "note"): string {
    if (mode === "share") {
      return `Native share is unavailable here. Copied cleaned ${scope} text to clipboard instead.`;
    }
    return `Copied cleaned ${scope} text.`;
  }

  private openPreview(text: string) {
    new TextPreviewModal(this.app, text).open();
  }

  private isAbortError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const maybeDomException = error as { name?: string };
    return maybeDomException.name === "AbortError";
  }
}
