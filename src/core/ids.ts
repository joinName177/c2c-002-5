let tagSeq = 0;
export function createTagId(): string {
  tagSeq += 1;
  return `tag-${Date.now().toString(36)}-${tagSeq}-${Math.random().toString(36).slice(2, 6)}`;
}
