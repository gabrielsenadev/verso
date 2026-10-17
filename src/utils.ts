import type { UnknownRecord } from './types.ts';

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

export function findObjectWithKey(
  obj: unknown,
  targetKey: string,
  maxDepth = 15
): UnknownRecord | null {
  if (!isRecord(obj) || maxDepth <= 0) return null;
  if (obj[targetKey] !== undefined) return obj;
  for (const key of Object.keys(obj)) {
    const result = findObjectWithKey(obj[key], targetKey, maxDepth - 1);
    if (result) return result;
  }
  return null;
}

/** Reads InnerTube text, which is a plain string, `{ content }` or `{ runs }`. */
export function readText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!isRecord(value)) return null;
  if (typeof value['content'] === 'string') return readText(value['content']);
  if (!Array.isArray(value['runs'])) return null;
  const text = value['runs']
    .map((run: unknown) =>
      isRecord(run) && typeof run['text'] === 'string' ? run['text'] : ''
    )
    .join('');
  return text.trim() || null;
}

/** Resolves once `selector` matches; rejects after `timeout` ms if given. */
export function waitForElement(selector: string, timeout?: number): Promise<Element> {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver((_, obs) => {
      const found = document.querySelector(selector);
      if (found) {
        obs.disconnect();
        if (timer !== undefined) clearTimeout(timer);
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer =
      timeout === undefined
        ? undefined
        : setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
          }, timeout);
  });
}

export function getScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}
