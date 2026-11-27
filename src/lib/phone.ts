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

/**
 * Gera chave estável para agrupar pessoas lançadas pelo garçom sem telefone
 * na mesma comanda (ex.: "João" / "joao" -> "garcom:joao").
 */
export function buildGarcomPessoaKey(nome: string): string {
  const slug = nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `garcom:${slug || "cliente"}`;
}

export function isGarcomPessoaKey(value: string): boolean {
  return /^garcom:[a-z0-9-]+$/i.test(value.trim());
}

export function formatPessoaContato(telefone: string): string {
  const clean = telefone.trim();
  if (!clean || isGarcomPessoaKey(clean)) {
    return "Sem telefone (garçom)";
  }
  return formatBrPhoneMask(clean) || clean;
}
