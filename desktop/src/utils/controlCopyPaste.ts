import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

let initialized = false;
let enabled = false;

function isMacLike() {
  return /mac|iphone|ipad|ipod/i.test(navigator.platform);
}

function isEditableElement(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (!(el instanceof HTMLInputElement)) return false;
  return !el.disabled && !el.readOnly && el.type !== "password";
}

function getSelectedText(el: Element | null) {
  if (isEditableElement(el)) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    return start === end ? "" : el.value.slice(start, end);
  }
  return window.getSelection()?.toString() ?? "";
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
}

function insertText(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = `${el.value.slice(0, start)}${text}${el.value.slice(end)}`;
  setInputValue(el, next);
  const cursor = start + text.length;
  el.setSelectionRange(cursor, cursor);
  el.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    data: text,
    inputType: "insertText",
  }));
}

export function configureControlCopyPasteBridge(nextEnabled: boolean) {
  enabled = nextEnabled;
  if (initialized || !isMacLike()) return;
  initialized = true;

  window.addEventListener("keydown", (e) => {
    if (!enabled) return;
    if (e.defaultPrevented || !e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key !== "c" && key !== "v") return;

    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("[data-shortcut-recorder='true']")) return;

    if (key === "c") {
      const selected = getSelectedText(document.activeElement);
      if (!selected) return;
      e.preventDefault();
      void writeText(selected);
      return;
    }

    const active = document.activeElement;
    if (!isEditableElement(active)) return;
    e.preventDefault();
    void readText().then((text) => {
      if (text) insertText(active, text);
    }).catch(() => {});
  });
}
