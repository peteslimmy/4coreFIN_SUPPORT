export function formatCurrencyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  let intPart = dot === -1 ? cleaned : cleaned.slice(0, dot);
  let decPart = dot === -1 ? '' : cleaned.slice(dot + 1);
  decPart = decPart.slice(0, 2);
  intPart = intPart.replace(/^0+(?=\d)/, '');
  const formattedInt = intPart === '' ? '' : Number(intPart).toLocaleString('en-US');
  if (formattedInt === '' && decPart !== '') return `0.${decPart}`;
  return decPart ? `${formattedInt}.${decPart}` : formattedInt;
}

export function parseNaira(value: string): number {
  const n = Number(value.replace(/[^\d.]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}
