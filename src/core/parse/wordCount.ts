const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu;

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}
