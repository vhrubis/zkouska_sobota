# FVE-ÚK — Inventura solárního potenciálu střech

Prototyp pro Českou AI olympiádu 2026 (linie 3 — obrazová data).
Automatická klasifikace všech střech v obci z ortofoto snímků + nástroj pro správce.

## Jak spustit

1. Dvojklik na **`spustit.bat`**
2. Otevře se prohlížeč na `http://localhost:8080/web/`
3. Ukončení: zavři černé okno (nebo Ctrl+C)

> Vyžaduje nainstalovaný Node.js. Dashboard se musí spouštět přes server
> (`spustit.bat`), ne otevřením `index.html` napřímo.

## Co to dělá

- **8 282 střech Litvínova** staženo z ČÚZK ortofoto (přes OpenStreetMap polygony budov)
- Každá střecha klasifikována do 4 tříd modelem **přetrénovaným na reálných ČÚZK snímcích**
  (zmrazený MobileNet základ z Teachable Machine + nová hlava trénovaná na 71 ručně
  olabelovaných reálných snímcích; přesnost na kontrolním vzorku ~82 %)
- Střechy s nejvyšší jistotou < 60 % → složka **Nejistá klasifikace**
- Adresy doplněny z OSM/RÚIAN (cca polovina budov), zbytek GPS + odkaz na mapu
- Správce v dashboardu střechy potvrzuje (→ K vyřízení → Hotovo) nebo posílá ke kontrole

## Struktura projektu

| Soubor / složka | Obsah |
|---|---|
| `spustit.bat` | spouštěč (server + prohlížeč) |
| `server.js` | malý statický web server |
| `web/` | dashboard (index.html, styl.css, app.js, klasifikace.json) |
| `litvinov_strechy/` | 8 282 PNG snímků střech (224×224) |
| `litvinov_strechy_index.csv` | mapování snímek → OSM ID + GPS |
| `klasifikuj.js` | klasifikace snímků modelem (tfjs + WASM) |
| `stahni_strechy.ps1` | stažení snímků z ČÚZK |
| `adresy_join.js` | prostorové přiřazení adres k budovám |
| `model/` | natrénovaný Teachable Machine model |
| `data/` | zdrojová data (budovy, adresy) |

## Znovu-spuštění klasifikace

```
node klasifikuj.js        # přepíše web/klasifikace.json
```
