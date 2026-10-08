export const brandPath =
  "m20 7 11 7v12l-11 7-11-7V14l11-7Zm0 5-6 4 6 4 6-4-6-4Zm-7 9v3l5 3v-3l-5-3Zm9 3v3l5-3v-3l-5 3Z";

export function updateFavicon() {
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) return;
  const style = getComputedStyle(document.documentElement);
  const fill = style.getPropertyValue("--accent-fill").trim();
  const ink = style.getPropertyValue("--accent-ink").trim();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="${fill}"/><path d="${brandPath}" fill="${ink}"/></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  if (icon.href !== url) icon.href = url;
}
