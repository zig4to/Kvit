// Prijava iz huba (Bitneverse): povezava do aplikacije lahko nosi fragment
// `#sb_at=<access_token>&sb_rt=<refresh_token>`.
//
// Inline skripta, ki teče sinhrono med razčlenjevanjem HTML (v <head>, pred
// prvim izrisom telesa). Če naslov nosi omenjena žetona, postavi
// `data-sso="pending"` na <html>. Na prijavni strani ta atribut skrije
// prijavni obrazec in pokaže nalagalnik, dokler se samodejna prijava ne
// zaključi (glej src/app/login/page.tsx in [data-sso] pravila v globals.css).
// Ob neuspehu useEffect na /login vrne `data-sso="idle"` in obrazec se pokaže.
//
// Enak vzorec kot data-theme (src/lib/theme.ts): atribut je naveden tudi v
// JSX na <html>, zato ga React ob hidraciji ne povozi.
export const SSO_PREPAINT_SCRIPT = `(function(){try{var h=(location.hash||"").replace(/^#/,"");if(h.indexOf("sb_at=")>-1&&h.indexOf("sb_rt=")>-1){document.documentElement.setAttribute("data-sso","pending");}}catch(e){}})()`;

// Žetona iz naslova prevzamemo enkrat na nalaganje strani in ju do konca
// prijave hranimo tu. V `next dev` (React StrictMode, živa seja v Klodiju) se
// useEffect zažene dvakrat: prvi zagon fragment pobriše, drugi bi ga sicer ne
// našel več in pokazal obrazec, prvi pa je medtem preklican — prijava se ne
// bi nikoli zaključila.
let ssoTokens: { access_token: string; refresh_token: string } | null = null;

/** Prebere (in iz naslova pobriše) `#sb_at…&sb_rt…`; vrne žetona, dokler prijava ni zaključena. */
export function takeSsoTokens(): { access_token: string; refresh_token: string } | null {
  const raw = window.location.hash.replace(/^#/, "");
  if (raw.indexOf("sb_at=") > -1 && raw.indexOf("sb_rt=") > -1) {
    const params = new URLSearchParams(raw);
    const accessToken = params.get("sb_at");
    const refreshToken = params.get("sb_rt");
    // Iz naslovne vrstice odstranimo le SSO parametra, ostalo pustimo.
    params.delete("sb_at");
    params.delete("sb_rt");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search + (rest ? "#" + rest : ""),
    );
    ssoTokens = accessToken && refreshToken ? { access_token: accessToken, refresh_token: refreshToken } : null;
  }
  return ssoTokens;
}

/** Po zaključeni (ali neuspeli) prijavi žetona pozabimo — kasnejša odjava ne sme spet prijaviti. */
export function dropSsoTokens() {
  ssoTokens = null;
}
