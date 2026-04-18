/**
 * Tiny DOM helpers. No framework. No dependencies.
 */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

export function show(el) { el?.classList.remove("hidden"); }
export function hide(el) { el?.classList.add("hidden"); }
export function toggle(el, on) { el?.classList.toggle("hidden", !on); }

export function typewrite(node, text, speedMs = 18) {
  return new Promise((resolve) => {
    node.textContent = "";
    let i = 0;
    const step = () => {
      if (i >= text.length) return resolve();
      node.textContent += text[i++];
      setTimeout(step, speedMs);
    };
    step();
  });
}
