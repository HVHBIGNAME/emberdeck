export function publicFile(path: string) {
  return `${import.meta.env.BASE_URL}${path}`;
}
