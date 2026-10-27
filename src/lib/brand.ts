/** Short form of a product title: the part before " (", " | ", a dash or a comma. */
export function shortTitle(title: string): string {
  const short = title.split(/\s+\(|\s+[|—–]\s+|,\s+/)[0].trim();
  return short || title;
}
