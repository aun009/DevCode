import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "./index.css";
import { useEffect, useMemo, useRef, useState } from "react";

const rawApiUrl = process.env.API_URL || "https://devcode-yx51.onrender.com";
const API_BASE_URL = rawApiUrl.includes("yd8t") ? "https://devcode-yx51.onrender.com" : rawApiUrl;

const languages = [
  { value: "python",     label: "Python",     file: "main.py",   prism: "python",     icon: "🐍" },
  { value: "cpp",        label: "C++17",       file: "main.cpp",  prism: "cpp",        icon: "⚡" },
  { value: "c",          label: "C",           file: "main.c",    prism: "c",          icon: "🔧" },
  { value: "java",       label: "Java",        file: "Main.java", prism: "java",       icon: "☕" },
  { value: "javascript", label: "JavaScript",  file: "main.js",   prism: "javascript", icon: "JS" },
] as const;

const languageExamples = {
  c: `#include <stdio.h>

int main() {
    char name[100];
    scanf("%99s", name);
    printf("Hello, %s\\n", name);
    return 0;
}`,
  cpp: `#include <iostream>
using namespace std;

int main() {
    string name;
    cin >> name;
    cout << "Hello, " << name << endl;
    return 0;
}`,
  java: `public class Main {
    public static void main(String[] args) {
        java.util.Scanner sc = new java.util.Scanner(System.in);
        String name = sc.next();
        System.out.println("Hello, " + name);
    }
}`,
  javascript: `const fs = require("fs");
const input = fs.readFileSync(0, "utf8").trim();

console.log(\`Hello, \${input}\`);`,
  python: `name = input()
print(f"Hello, {name}")`,
} as const;

type Language = keyof typeof languageExamples;

type Submission = {
  id: string;
  language: Language;
  status: "Processing" | "Success" | "CompilationError" | "RuntimeError" | "TimeLimitExceeded" | "Failure";
  output: string | null;
  stderr: string | null;
  exitCode: number | null;
  executionTimeMs: number | null;
};

/** Textarea + highlighted <pre> overlay — no external editor package needed */
function CodeEditor({
  value,
  onChange,
  prismLang,
}: {
  value: string;
  onChange: (v: string) => void;
  prismLang: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const highlighted = useMemo(() => {
    const grammar = Prism.languages[prismLang] ?? Prism.languages.clike;
    return Prism.highlight(value, grammar, prismLang);
  }, [value, prismLang]);

  // Sync textarea scroll to pre overlay
  const handleScroll = () => {
    const ta = textareaRef.current;
    const pre = ta?.previousSibling as HTMLPreElement | null;
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  };

  // Handle Tab key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = value.substring(0, start) + "    " + value.substring(end);
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 4;
      });
    }
  };

  return (
    <div className="editor-wrap">
      {/* highlighted overlay */}
      <pre
        className="editor-pre"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlighted + "\n" }}
      />
      {/* actual editable textarea — transparent text over the pre */}
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}

export function App() {
  const [language, setLanguage] = useState<Language>("python");
  const [code, setCode] = useState(languageExamples.python);
  const [input, setInput] = useState("World");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Resizable split
  const [editorWidthPct, setEditorWidthPct] = useState(57);
  const [inputHeight, setInputHeight] = useState(150);
  const hDragRef = useRef(false);
  const vDragRef = useRef(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  const activeLanguage = useMemo(
    () => languages.find((l) => l.value === language) ?? languages[0],
    [language]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (hDragRef.current && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        setEditorWidthPct(Math.min(80, Math.max(20, pct)));
      }
      if (vDragRef.current && rightRef.current) {
        const rect = rightRef.current.getBoundingClientRect();
        const fromBottom = rect.bottom - e.clientY;
        setInputHeight(Math.min(rect.height - 80, Math.max(50, fromBottom)));
      }
    };
    const onUp = () => { hDragRef.current = false; vDragRef.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const selectLanguage = (next: Language) => {
    setLanguage(next);
    setCode(languageExamples[next]);
    setSubmission(null);
    setError("");
  };

  const refreshSubmission = async (id: string) => {
    const res = await fetch(`${API_BASE_URL}/submission/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load submission");
    setSubmission(data);
  };

  const submitCode = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/submission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language, input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      await refreshSubmission(data.submissionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!submission || submission.status !== "Processing") return;
    const iv = window.setInterval(() => {
      refreshSubmission(submission.id).catch((e) =>
        setError(e instanceof Error ? e.message : String(e))
      );
    }, 1200);
    return () => window.clearInterval(iv);
  }, [submission]);

  const statusInfo = useMemo(() => {
    if (!submission) return { label: "Ready", cls: "status-ready" };
    if (submission.status === "Success") return { label: "✓ Success", cls: "status-success" };
    if (submission.status === "Processing") return { label: "Running…", cls: "status-running" };
    return { label: submission.status.replace(/([A-Z])/g, " $1").trim(), cls: "status-error" };
  }, [submission]);

  return (
    <div className="app-root">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">{"</>"}</span>
          <span className="logo-text">DevCode</span>
        </div>
        <nav className="sidebar-nav">
          {languages.map((l) => (
            <button
              key={l.value}
              type="button"
              title={l.label}
              onClick={() => selectLanguage(l.value)}
              className={`sidebar-lang-btn${language === l.value ? " sidebar-lang-btn--active" : ""}`}
            >
              <span className="btn-icon">{l.icon}</span>
              <span className="btn-label">{l.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <div className="main-area">
        {/* Topbar */}
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <span className="bc-lang">{activeLanguage.label}</span>
            <span className="bc-sep">›</span>
            <span className="bc-file">{activeLanguage.file}</span>
          </div>
          <div className="topbar-actions">
            <span className={`status-badge ${statusInfo.cls}`}>{statusInfo.label}</span>
            {submission?.executionTimeMs != null && (
              <span className="time-chip">{submission.executionTimeMs}ms</span>
            )}
            <button
              type="button"
              className="run-btn"
              onClick={submitCode}
              disabled={isSubmitting || code.trim().length === 0}
            >
              {isSubmitting ? (
                <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
              Run
            </button>
          </div>
        </header>

        {/* Split workspace */}
        <div className="workspace" ref={workspaceRef}>
          {/* Editor */}
          <div className="editor-panel" style={{ width: `${editorWidthPct}%` }}>
            <div className="panel-bar">
              <span className="panel-filename">{activeLanguage.file}</span>
            </div>
            <CodeEditor
              value={code}
              onChange={setCode}
              prismLang={activeLanguage.prism}
            />
          </div>

          {/* Vertical drag */}
          <div
            className="divider divider-v"
            onMouseDown={(e) => { e.preventDefault(); hDragRef.current = true; }}
          />

          {/* Right panel */}
          <div className="right-panel" style={{ width: `${100 - editorWidthPct}%` }} ref={rightRef}>
            {/* Output */}
            <div className="output-panel" style={{ height: `calc(100% - ${inputHeight}px - 4px)` }}>
              <div className="panel-bar">
                <span>Output</span>
                {submission?.exitCode != null && (
                  <span className={`exit-chip ${submission.exitCode === 0 ? "exit-ok" : "exit-err"}`}>
                    exit {submission.exitCode}
                  </span>
                )}
              </div>
              <div className="output-body">
                {!submission && !isSubmitting && !error && (
                  <span className="output-placeholder">Click <strong>Run</strong> to execute your code</span>
                )}
                {isSubmitting && !submission && (
                  <span className="output-placeholder running-text">Executing…</span>
                )}
                {submission?.output && <pre className="output-text">{submission.output}</pre>}
                {submission?.stderr && <pre className="stderr-text">{submission.stderr}</pre>}
                {error && <div className="error-box">{error}</div>}
              </div>
            </div>

            {/* Horizontal drag */}
            <div
              className="divider divider-h"
              onMouseDown={(e) => { e.preventDefault(); vDragRef.current = true; }}
            />

            {/* Input */}
            <div className="input-panel" style={{ height: `${inputHeight}px` }}>
              <div className="panel-bar">
                <span>Input (stdin)</span>
              </div>
              <textarea
                className="input-editor"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter input here…"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
