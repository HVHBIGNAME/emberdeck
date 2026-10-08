export interface CursorTarget {
  element: HTMLElement | null;
  native: boolean;
}

export function cursorTarget(hit: Element | null): CursorTarget {
  if (!hit) return { element: null, native: false };
  const control = hit.closest<HTMLElement>(
    'button, a[href], summary, [role="option"], [role="combobox"], [role="switch"], [role="slider"], input, textarea, [contenteditable="true"], label:has(> input[type="radio"]), label:has(> input[type="checkbox"]), [data-cursor-target]',
  );
  const input = control instanceof HTMLLabelElement ? control.control : control;
  const native = Boolean(
    input?.matches(
      'textarea, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), :disabled, [aria-disabled="true"]',
    ),
  );
  if (native) return { element: null, native: true };
  const scope = hit.closest<HTMLElement>(
    '[data-cursor-scope="range"], [data-cursor-scope="choice"]',
  );
  if (scope) return { element: scope, native: false };
  if (control?.dataset.cursorTarget === "parent")
    return { element: control.parentElement, native: false };
  if (control instanceof HTMLInputElement)
    return { element: control.closest("label") || control, native: false };
  return { element: control, native: false };
}

function radius(value: string, dimension: number) {
  return value.endsWith("%")
    ? (parseFloat(value) * dimension) / 100
    : parseFloat(value);
}

export function cursorGeometry(element: HTMLElement, gap = 4) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const width = element.offsetWidth || rect.width;
  const height = element.offsetHeight || rect.height;
  const corners = [
    style.borderTopLeftRadius,
    style.borderTopRightRadius,
    style.borderBottomRightRadius,
    style.borderBottomLeftRadius,
  ].map((corner) => {
    const [x, y = x] = corner.split(" ");
    return [
      (radius(x, width) * rect.width) / width,
      (radius(y, height) * rect.height) / height,
    ];
  });
  const ratio = (available: number, used: number) =>
    used > 0 ? Math.min(1, available / used) : 1;
  const scale = Math.min(
    ratio(rect.width, corners[0][0] + corners[1][0]),
    ratio(rect.width, corners[3][0] + corners[2][0]),
    ratio(rect.height, corners[0][1] + corners[3][1]),
    ratio(rect.height, corners[1][1] + corners[2][1]),
  );
  const expanded = (value: number) => (value > 0 ? value * scale + gap : 0);
  return {
    x: rect.left - gap,
    y: rect.top - gap,
    width: rect.width + gap * 2,
    height: rect.height + gap * 2,
    radii: [
      ...corners.map(([x]) => expanded(x)),
      ...corners.map(([, y]) => expanded(y)),
    ],
  };
}
