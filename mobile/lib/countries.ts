import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(enLocale);

export type Country = { code: string; name: string };

// Full ISO alpha-2 country list, sorted by name — mirrors the web edit-profile
// `<select>`. `code` (lowercase) drives the flagcdn flag images.
export const COUNTRY_LIST: Country[] = Object.entries(
  countries.getNames("en", { select: "official" }) as Record<string, string>,
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function countryName(code: string | null): string | null {
  if (!code) return null;
  return countries.getName(code, "en") ?? code;
}

export function flagUrl(code: string, size: "24x18" | "48x36" = "24x18") {
  return `https://flagcdn.com/${size}/${code.toLowerCase()}.png`;
}
