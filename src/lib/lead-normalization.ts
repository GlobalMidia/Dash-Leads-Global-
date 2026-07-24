export function normalizeComparableText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeCompany(value: string) {
  return normalizeComparableText(value);
}

export function normalizeEmail(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
}
