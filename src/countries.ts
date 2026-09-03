import { ISO3166, type IsoRow } from "./data/iso3166";
import type { Country, CountryId } from "./types";

/**
 * Country identity.
 *
 * The atlas keys countries by ISO 3166-1 numeric code, zero-padded ("566").
 * Nobody thinks of Nigeria as 566, so every place the library accepts a
 * country also accepts the alpha-2 ("NG") and alpha-3 ("NGA") codes, in any
 * case, and unpadded numbers. Everything is normalised to the padded numeric
 * form once, here, and compared as that everywhere else.
 */

let byNumeric: Map<string, Country> | null = null;
let byAlpha: Map<string, Country> | null = null;

function index(): void {
  if (byNumeric) return;
  byNumeric = new Map();
  byAlpha = new Map();
  for (const row of ISO3166) {
    const country = fromRow(row);
    byNumeric.set(country.id, country);
    byAlpha.set(country.alpha2, country);
    byAlpha.set(country.alpha3, country);
  }
}

function fromRow([numeric, alpha2, alpha3, name, region, subRegion, intermediateRegion]: IsoRow): Country {
  return { id: numeric, alpha2, alpha3, name, region, subRegion, intermediateRegion };
}

const NUMERIC = /^\d{1,3}$/;
const ALPHA = /^[A-Za-z]{2,3}$/;

/**
 * The padded numeric key for any way of naming a country.
 *
 *     isoKey(4)      // "004"
 *     isoKey("NG")   // "566"
 *     isoKey("nga")  // "566"
 *
 * An alpha code that is not a country throws, because the alternative is a
 * region that silently highlights nothing. Numeric input is padded and
 * returned as is, even when it is not in the table, so an atlas with ids the
 * table lacks still works.
 */
export function isoKey(id: CountryId): string {
  const text = String(id).trim();
  if (NUMERIC.test(text)) return text.padStart(3, "0");

  if (ALPHA.test(text)) {
    index();
    const country = byAlpha?.get(text.toUpperCase());
    if (country) return country.id;
  }

  throw new Error(
    `terrella: "${text}" is not a country. Use an ISO 3166-1 numeric, alpha-2 or alpha-3 code.`,
  );
}

/** Everything known about a country, or null if the code is not one. */
export function country(id: CountryId): Country | null {
  index();
  try {
    return byNumeric?.get(isoKey(id)) ?? null;
  } catch {
    return null;
  }
}

/** The display name for a country, or the code itself if it is unknown. */
export function countryName(id: CountryId): string {
  return country(id)?.name ?? String(id);
}

/**
 * The numeric ids of every country in a UN region, sub-region or
 * intermediate region.
 *
 *     countriesIn("Africa")
 *     countriesIn("Western Africa")
 *     countriesIn("South-eastern Asia")
 *     countriesIn("Latin America and the Caribbean")
 *
 * Case-insensitive. Unknown names throw, listing what is available, so a
 * misspelt continent fails at the call rather than as an empty region.
 */
export function countriesIn(regionName: string): string[] {
  const wanted = regionName.trim().toLowerCase();
  const ids = ISO3166.filter((row) =>
    row.slice(4).some((level) => level.toLowerCase() === wanted),
  ).map(([numeric]) => numeric);

  if (ids.length === 0) {
    throw new Error(
      `terrella: no region called "${regionName}". Known regions: ${REGION_NAMES.join(", ")}`,
    );
  }
  return ids;
}

/** Every region name `countriesIn` accepts. */
export const REGION_NAMES: readonly string[] = Array.from(
  new Set(ISO3166.flatMap((row) => row.slice(4)).filter(Boolean)),
).sort();

/** All countries, for building pickers. */
export function allCountries(): Country[] {
  return ISO3166.map(fromRow);
}
