// Razdelki na strani Avti (roki, servisi, popravila, podatki, stroški) so
// privzeto zaprti. Odprti so zapisani v piškotku, ne v localStorage: strežnik
// ga prebere in stran ob osvežitvi takoj nariše pravilno odprte razdelke —
// brez utripa „zapri → odpri“.
// Velja za vse avte hkrati (odpreš „Podatki o vozilu“ → odprto povsod).

export const CARS_OPEN_COOKIE = "kvit-avti-odprto";

export function parseOpen(value: string | undefined): string[] {
  return value ? value.split(".").filter(Boolean) : [];
}

// Samo v brskalniku.
export function setSectionOpen(section: string, open: boolean) {
  const name = `${CARS_OPEN_COOKIE}=`;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(name));
  const ids = new Set(parseOpen(hit?.slice(name.length)));
  if (open) ids.add(section);
  else ids.delete(section);
  document.cookie = ids.size
    ? `${CARS_OPEN_COOKIE}=${[...ids].join(".")}; path=/; max-age=31536000; samesite=lax`
    : `${CARS_OPEN_COOKIE}=; path=/; max-age=0`;
}
