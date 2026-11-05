// Zloženi razdelki na strani Avti (roki, servisi, popravila, podatki) so v
// piškotku, ne v localStorage: strežnik ga prebere in stran ob osvežitvi takoj
// nariše pravilno zložene razdelke — brez utripa „odpri → zapri“.
// Velja za vse avte hkrati (zložiš „Podatki o vozilu“ → zloženo povsod).

export const CARS_COLLAPSED_COOKIE = "kvit-avti-zlozeno";

export function parseCollapsed(value: string | undefined): string[] {
  return value ? value.split(".").filter(Boolean) : [];
}

// Samo v brskalniku.
export function setSectionCollapsed(section: string, collapsed: boolean) {
  const name = `${CARS_COLLAPSED_COOKIE}=`;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(name));
  const ids = new Set(parseCollapsed(hit?.slice(name.length)));
  if (collapsed) ids.add(section);
  else ids.delete(section);
  document.cookie = ids.size
    ? `${CARS_COLLAPSED_COOKIE}=${[...ids].join(".")}; path=/; max-age=31536000; samesite=lax`
    : `${CARS_COLLAPSED_COOKIE}=; path=/; max-age=0`;
}
