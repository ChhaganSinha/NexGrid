// Minimal DOM construction helpers for the vanilla renderer.
//
// WHY THESE EXIST: this package has zero runtime dependencies, so every node in
// the DOM contract is built by hand. Writing that with bare
// `document.createElement` plus a dozen property assignments per node buries
// the structure the spec describes under boilerplate; `el()` lets the renderer
// read like the tree it is producing.
//
// They also make the security rule STRUCTURAL rather than a convention that
// someone has to remember: `el()` writes text through `textContent` and has no
// code path that assigns markup, so a row value can never reach an HTML parser.
// Elements only ever enter the tree as real `Node`s — either ones we built, or
// ones a consumer's custom cell renderer handed us deliberately.

/** Anything that may be passed as a child; falsy values are skipped. */
export type ElementChild = string | number | Node | null | undefined | false;

/** Declarative properties accepted by {@link el} and {@link svgEl}. */
export interface ElementProps {
  /** Value for the `class` attribute. */
  class?: string;
  /** Text content, assigned via `textContent` (never parsed as HTML). */
  text?: string;
  /**
   * Attributes to set. `undefined`/`null`/`false` values are skipped entirely
   * and `true` renders as an empty attribute, which is what boolean ARIA and
   * HTML attributes want.
   */
  attrs?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  /** Inline styles keyed by camelCase property name (`minWidth`). */
  style?: Readonly<Record<string, string | undefined>>;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** `minWidth` -> `min-width`, so style keys can stay camelCase at call sites. */
function toCssProperty(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function applyProps(node: Element, props: ElementProps): void {
  if (props.class !== undefined) node.setAttribute("class", props.class);
  if (props.text !== undefined) node.textContent = props.text;

  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) {
      if (value === undefined || value === null || value === false) continue;
      node.setAttribute(name, value === true ? "" : String(value));
    }
  }

  if (props.style && node instanceof HTMLElement) {
    for (const [name, value] of Object.entries(props.style)) {
      if (value === undefined) continue;
      node.style.setProperty(toCssProperty(name), value);
    }
  }
}

/** Append children, turning primitives into text nodes and dropping falsy ones. */
export function append(parent: Node, children: readonly ElementChild[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Create an HTML element.
 *
 * @param tag      Tag name; the return type is narrowed to the matching element.
 * @param props    Class, text, attributes and inline styles.
 * @param children Child nodes or primitives (rendered as text).
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElementProps,
  children?: readonly ElementChild[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) applyProps(node, props);
  if (children) append(node, children);
  return node;
}

/**
 * Create an SVG element in the SVG namespace.
 *
 * `createElementNS` is not an optional detail: an `<svg>` built with
 * `createElement` lands in the HTML namespace and renders as nothing. It is
 * also why icons are never assembled from markup strings.
 */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  props?: ElementProps,
  children?: readonly ElementChild[],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NAMESPACE, tag) as SVGElementTagNameMap[K];
  if (props) applyProps(node, props);
  if (children) append(node, children);
  return node;
}

/** Replace every child of `parent` with `children`. */
export function replaceChildren(parent: Element, children: readonly ElementChild[]): void {
  parent.textContent = "";
  append(parent, children);
}
