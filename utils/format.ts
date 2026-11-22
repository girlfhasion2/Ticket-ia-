/**
 * Formato de importes en toda la app: coma decimal y dos decimales (ej. 117,05€).
 * Para cambiar de idioma o región más adelante, basta con tocar LOCALE.
 */
const LOCALE = 'es-ES';

const amountFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 117.05 -> "117,05" */
export const formatAmount = (value: number): string =>
  amountFormatter.format(Number.isFinite(value) ? value : 0);

/** 117.05 -> "117,05€" */
export const formatMoney = (value: number): string => `${formatAmount(value)}€`;

/** Texto editable de un precio: 7.95 -> "7,95", 12 -> "12" */
export const formatPriceForInput = (value: number): string =>
  String(Number((Number.isFinite(value) ? value : 0).toFixed(2))).replace('.', ',');
