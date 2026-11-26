/**
 * Normaliza telefone brasileiro para conter apenas dígitos (sem o +55 inicial).
 */
export function normalizeBrPhone(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  return digits;
}

/**
 * Valida se o telefone brasileiro possui 10 ou 11 dígitos válidos.
 */
export function isValidBrPhone(input: string): boolean {
  const digits = normalizeBrPhone(input);
  if (digits.length !== 10 && digits.length !== 11) {
    return false;
  }

  // Rejeita sequências repetidas como 11111111111
  if (/^(\d)\1+$/.test(digits)) {
    return false;
  }

  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) {
    return false;
  }

  // Celulares de 11 dígitos começam com 9
  if (digits.length === 11 && digits[2] !== "9") {
    return false;
  }

  return true;
}

/**
 * Aplica máscara amigável para exibição e digitação de telefone BR.
 */
export function formatBrPhoneMask(input: string): string {
  const digits = normalizeBrPhone(input).slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
