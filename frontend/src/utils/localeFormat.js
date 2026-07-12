export const ARABIC_LATIN_LOCALE = "ar-SY-u-nu-latn";
export const LATIN_NUMBER_LOCALE = "en-US";

export function formatLatinNumber(value, options) {
  const numeric = Number(value) || 0;
  return new Intl.NumberFormat(LATIN_NUMBER_LOCALE, options).format(numeric);
}
