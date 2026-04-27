import countriesData from "world-countries";

export type Country = { name: string; code: string; flag: string };

export const countries: Country[] = countriesData
  .map((c) => ({ name: c.name.common, code: c.cca2, flag: c.flag }))
  .sort((a, b) => a.name.localeCompare(b.name));
