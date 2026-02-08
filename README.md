# YT Desk (Electron mini-klienst)

Egyszerű desktop alkalmazás, amely több YouTube-lejátszót kezel: bal oldali listába felvehetsz tetszőleges videót (URL vagy ID), a fő ablakban egy videót nézel vagy grid módban több lejátszó is futhat, clean módban eltűnik minden UI.

## Futtatás

1) Függjőségek telepítése (internet kell):  
`npm install`

2) Indítás:  
`npm start`

Megjegyzés: a renderer egy lokális HTTP szerverről töltődik (127.0.0.1, dinamikus port), hogy a YouTube IFrame API érvényes origin-t kapjon. Nincs külső függőség, a szerver a main processben fut.
Alapértelmezett port: 38999 (ha foglalt, 39000). A stabil port miatt a localStorage/Google tokenek megmaradnak újraindítás után is.

### Szükséges Google/YT adatok

Állítsd be az adatokat kétféleképp:

1) Lokális fájl: `config.local.json` (git-ignorált). Minta: `config.example.json`.  
2) Vagy környezeti változóként indulás előtt:  
   - `YT_CLIENT_ID` – OAuth 2.0 Client ID (Desktop / Installed app)  
   - `YT_CLIENT_SECRET` – opcionális, de refresh tokenhez ajánlott  
   - `YT_API_KEY` – kereséshez használható (auth nélkül is), de auth esetén Bearer-t használ.

Auth flow: eszközkód (device code). A bal oldali “Bejelentkezés” gomb megnyitja a verification URL-t, a böngészőben jóváhagyás után a kliens automatikusan poll-ozza a tokent. Token localStorage-ben tárolódik (nem titkosítva).

## Jelenlegi funkciók

- URL/ID beolvasása, oEmbed alapján cím lekérése (ha elérhető).  
- Lista kezelése (lejátszás, törlés), sorrend legutóbb hozzáadott felül.  
- Fő lejátszó, vagy grid mód minden videóval (muted).  
- Clean mód: csak a fő videó látszik, UI nélkül.  
- Megnyitás rendszer-böngészőben.
- YouTube keresés (Data API search).  
- Feliratkozások listázása (YouTube Data API, auth kell), csatorna megnyitás + legutóbbi videó hozzáadása.
- IFrame Player API: play/pause, mute/unmute (single és grid).

## Korlátok / TODO

- Telepítéshez hálózat kell (`npm install`), jelen környezetben blokkolt volt.  
- Token localStorage-ben, nincs titkosítás vagy több profil.  
- Keresés max 8 találat, nincs lapozás.  
- Feliratkozások max 25, nincs feed-sorrend (YouTube API korlát).  
- Nincs CI/test; linter placeholder.
