// Curated nation/team list for the player nationality picker. Cricket-playing
// nations are listed first (so they surface at the top of the dropdown), then a
// broad set of other countries. The combobox also allows a free-text custom
// value for anything not listed.
//
// `code` is what we STORE (ISO alpha-2 where one exists; short custom codes for
// cricket teams that aren't ISO countries, e.g. England/Scotland/West Indies).
// `fi` is the flag-icons asset code used for rendering (defaults to `code`).

export interface Nation {
  code: string;
  name: string;
  fi: string;
}

function n(code: string, name: string, fi?: string): Nation {
  return { code, name, fi: fi ?? code };
}

// --- Cricket nations / teams (top of the list) ---
const CRICKET_NATIONS: Nation[] = [
  n("in", "India"),
  n("au", "Australia"),
  n("eng", "England", "gb-eng"),
  n("pk", "Pakistan"),
  n("za", "South Africa"),
  n("nz", "New Zealand"),
  n("lk", "Sri Lanka"),
  n("bd", "Bangladesh"),
  n("wi", "West Indies", "wi"), // not an ISO country — custom flag asset
  n("af", "Afghanistan"),
  n("zw", "Zimbabwe"),
  n("ie", "Ireland"),
  n("sct", "Scotland", "gb-sct"),
  n("wls", "Wales", "gb-wls"),
  n("nl", "Netherlands"),
  n("np", "Nepal"),
  n("ae", "United Arab Emirates"),
  n("us", "United States"),
  n("ca", "Canada"),
  n("om", "Oman"),
  n("na", "Namibia"),
  n("pg", "Papua New Guinea"),
  n("hk", "Hong Kong"),
  n("ke", "Kenya"),
  n("bm", "Bermuda"),
  n("jm", "Jamaica"),
  n("tt", "Trinidad and Tobago"),
  n("bb", "Barbados"),
  n("gy", "Guyana"),
];

// --- Other countries (alphabetical by name) ---
const OTHER_NATIONS: Nation[] = [
  n("ar", "Argentina"),
  n("at", "Austria"),
  n("be", "Belgium"),
  n("br", "Brazil"),
  n("bg", "Bulgaria"),
  n("cm", "Cameroon"),
  n("cl", "Chile"),
  n("cn", "China"),
  n("co", "Colombia"),
  n("hr", "Croatia"),
  n("cz", "Czechia"),
  n("dk", "Denmark"),
  n("eg", "Egypt"),
  n("et", "Ethiopia"),
  n("fj", "Fiji"),
  n("fi", "Finland"),
  n("fr", "France"),
  n("de", "Germany"),
  n("gh", "Ghana"),
  n("gr", "Greece"),
  n("hu", "Hungary"),
  n("is", "Iceland"),
  n("id", "Indonesia"),
  n("ir", "Iran"),
  n("iq", "Iraq"),
  n("il", "Israel"),
  n("it", "Italy"),
  n("jp", "Japan"),
  n("jo", "Jordan"),
  n("kw", "Kuwait"),
  n("my", "Malaysia"),
  n("mv", "Maldives"),
  n("mu", "Mauritius"),
  n("mx", "Mexico"),
  n("ma", "Morocco"),
  n("mz", "Mozambique"),
  n("ng", "Nigeria"),
  n("no", "Norway"),
  n("ph", "Philippines"),
  n("pl", "Poland"),
  n("pt", "Portugal"),
  n("qa", "Qatar"),
  n("ro", "Romania"),
  n("ru", "Russia"),
  n("rw", "Rwanda"),
  n("sa", "Saudi Arabia"),
  n("sn", "Senegal"),
  n("rs", "Serbia"),
  n("sg", "Singapore"),
  n("sk", "Slovakia"),
  n("kr", "South Korea"),
  n("es", "Spain"),
  n("se", "Sweden"),
  n("ch", "Switzerland"),
  n("tz", "Tanzania"),
  n("th", "Thailand"),
  n("tr", "Turkey"),
  n("ug", "Uganda"),
  n("ua", "Ukraine"),
  n("uy", "Uruguay"),
  n("vn", "Vietnam"),
  n("zm", "Zambia"),
];

export const NATIONS: Nation[] = [...CRICKET_NATIONS, ...OTHER_NATIONS];

const BY_CODE = new Map(NATIONS.map((x) => [x.code, x]));

/** Resolve a stored code to its nation entry (undefined for custom/free-text values). */
export function nationByCode(code: string | null | undefined): Nation | undefined {
  return code ? BY_CODE.get(code) : undefined;
}
