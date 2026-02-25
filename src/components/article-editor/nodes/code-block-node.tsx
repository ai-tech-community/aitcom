"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  $getNodeByKey,
} from "@payloadcms/richtext-lexical/lexical";

const CODE_LANGUAGES: Record<string, string> = {
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  plaintext: "Plain Text",
  python: "Python",
  shell: "Shell",
  sql: "SQL",
  typescript: "TypeScript",
  yaml: "YAML",
};

export type SerializedCodeBlockNode = SerializedLexicalNode & {
  type: "code-block";
  fields: {
    id: string;
    blockType: "Code";
    code: string;
    language: string;
    blockName: string;
  };
};

function CodeBlockComponent({
  code,
  language,
  nodeKey,
  editor,
}: {
  code: string;
  language: string;
  nodeKey: NodeKey;
  editor: LexicalEditor;
}) {
  const [currentCode, setCurrentCode] = useState(code);
  const [currentLang, setCurrentLang] = useState(language);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setCurrentCode(code);
    setCurrentLang(language);
  }, [code, language]);

  const updateNode = useCallback(
    (newCode: string, newLang: string) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (node instanceof CodeBlockNode) {
          node.setCode(newCode);
          node.setLanguage(newLang);
        }
      });
    },
    [editor, nodeKey],
  );

  const debouncedUpdateNode = useMemo(() => {
    let timer: NodeJS.Timeout;
    return (newCode: string, newLang: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => updateNode(newCode, newLang), 250);
    };
  }, [updateNode]);

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setCurrentCode(val);
      debouncedUpdateNode(val, currentLang);
    },
    [currentLang, debouncedUpdateNode],
  );

  const handleLangChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      setCurrentLang(val);
      updateNode(currentCode, val); // language changes are immediate
    },
    [currentCode, updateNode],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const newVal = val.substring(0, start) + "  " + val.substring(end);
      setCurrentCode(newVal);
      debouncedUpdateNode(newVal, currentLang);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }, [currentLang, debouncedUpdateNode]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [currentCode]);

  return (
    <div className="bg-muted/50 border-border my-4 overflow-hidden rounded border">
      <div className="border-border flex items-center justify-between border-b px-3 py-1.5">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground">CODE</span>
        <select
          value={currentLang}
          onChange={handleLangChange}
          className="bg-transparent text-xs text-muted-foreground focus:outline-none"
        >
          {Object.entries(CODE_LANGUAGES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <textarea
        ref={textareaRef}
        value={currentCode}
        onChange={handleCodeChange}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="w-full resize-none bg-transparent px-4 py-3 font-mono text-sm leading-relaxed focus:outline-none"
        rows={3}
      />
    </div>
  );
}

function generateBlockId(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 12);
}

export class CodeBlockNode extends DecoratorNode<React.JSX.Element> {
  __code: string;
  __language: string;
  __blockId: string;

  static getType(): string {
    return "code-block";  // internal Lexical type (NOT "block" to avoid conflict with Payload's BlockNode)
  }

  static clone(node: CodeBlockNode): CodeBlockNode {
    return new CodeBlockNode(node.__code, node.__language, node.__blockId, node.__key);
  }

  constructor(code: string, language: string, blockId?: string, key?: NodeKey) {
    super(key);
    this.__code = code;
    this.__language = language;
    this.__blockId = blockId ?? generateBlockId();
  }

  static importJSON(json: SerializedCodeBlockNode): CodeBlockNode {
    return new CodeBlockNode(
      json.fields?.code ?? "",
      json.fields?.language ?? "plaintext",
      json.fields?.id,
    );
  }

  exportJSON(): SerializedCodeBlockNode {
    return {
      type: "code-block",
      version: 1,
      fields: {
        id: this.__blockId,
        blockType: "Code",
        code: this.__code,
        language: this.__language,
        blockName: "",
      },
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement("div");
    div.setAttribute("data-lexical-block", "code");
    return div;
  }

  updateDOM(): boolean {
    return false;
  }

  setCode(code: string): void {
    const self = this.getWritable();
    self.__code = code;
  }

  setLanguage(language: string): void {
    const self = this.getWritable();
    self.__language = language;
  }

  getCode(): string {
    return this.__code;
  }

  getLanguage(): string {
    return this.__language;
  }

  isInline(): false {
    return false;
  }

  decorate(editor: LexicalEditor): React.JSX.Element {
    return (
      <CodeBlockComponent
        code={this.__code}
        language={this.__language}
        nodeKey={this.__key}
        editor={editor}
      />
    );
  }
}

export function $createCodeBlockNode(code = "", language = "typescript"): CodeBlockNode {
  return new CodeBlockNode(code, language);
}

export function $isCodeBlockNode(node: LexicalNode | null | undefined): node is CodeBlockNode {
  return node instanceof CodeBlockNode;
}
