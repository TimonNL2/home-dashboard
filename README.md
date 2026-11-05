# 🏠 Home Dashboard

Een strak, snel en zelf-gehost startpagina-dashboard voor je homeserver. Draait in één Docker-container.

## Functies

- **Hero met live aarde**: een langzaam draaiende 3D-aarde met dag en nacht volgens de echte zonnestand en stadslichten aan de nachtkant, met daarnaast klok, begroeting, het weer en de belangrijkste serverwaarden.
- **Slimme zoekbalk**: druk op `/`. Typen filtert je services, `Enter` opent de eerste match, een URL of een zoekopdracht (DuckDuckGo/Google).
- **Services met statuscheck**: groen/rood bolletje, responstijd en uptime-balkje van de laatste 30 checks. Zelf-ondertekende certificaten werken ook.
- **Serverstatistieken**: CPU (met grafiekje), geheugen, schijven, temperatuur, netwerk up/down, uptime en load van de **host**.
- **Docker-overzicht**: alle containers met status, optioneel starten/stoppen/herstarten.
- **Weer**: actueel + 5 dagen via Open-Meteo (geen API-key nodig), met regenwaarschuwing voor de komende 3 uur.
- **Takenlijst**: blijft bewaard in `./data`.
- **Wereld-tabblad**: realistische 3D-wereldbol (NASA Blue Marble, reliëf, glimmende oceanen, sterrenhemel) waarop je plekken markeert:
  - klik op de bol of zoek een stad (OpenStreetMap) om een plek toe te voegen
  - soorten: 📍 bezocht, ⭐ wil heen, 🏠 thuis, met datum en notitie
  - bezochte landen kleuren groen, met teller voor plekken, landen, continenten en "% van de wereld"
  - geanimeerde reislijnen vanaf thuis, verste reis, klik in de lijst om ernaartoe te vliegen
  - alles wordt opgeslagen in `./data/places.json`; de bol werkt ook zonder internet (alleen zoeken heeft internet nodig)
- **Bladwijzers**: gegroepeerd, met favicons.
- **Licht / donker / automatisch thema**, werkt op mobiel en is als app te installeren (PWA).
- **Config hot-reload**: `config/config.yml` aanpassen, opslaan, pagina verversen. Geen herstart nodig.
- **Optioneel inloggen** met gebruikersnaam/wachtwoord.

## Installatie (Ubuntu server)

Vereist: Docker met de compose-plugin (zie [docs.docker.com](https://docs.docker.com/engine/install/ubuntu/)).

```bash
git clone https://github.com/TimonNL2/home-dashboard.git
cd home-dashboard
docker compose up -d --build
```

Open daarna `http://<ip-van-je-server>:3000`.

Bij de eerste start wordt `config/config.yml` aangemaakt met voorbeelden. Pas die aan met `nano config/config.yml`.

### Updaten

```bash
git pull && docker compose up -d --build
```

### Kant-en-klare image (zonder zelf bouwen)

Elke push naar `main` bouwt via GitHub Actions automatisch een image (amd64 + arm64) naar GitHub Container Registry. Vervang in `docker-compose.yml` de regels `build: .` en `image:` door:

```yaml
    image: ghcr.io/timonnl2/home-dashboard:latest
```

Updaten gaat dan met `docker compose pull && docker compose up -d`.
Bij een privé repo: eerst `docker login ghcr.io` (met een GitHub token met `read:packages`).

## Configuratie

Alles staat in `config/config.yml`; zie [`config.example.yml`](config.example.yml) voor alle opties.

| Onderdeel | Uitleg |
|---|---|
| `name` | Je naam voor de begroeting |
| `weather` | Plaatsnaam + coördinaten (op te zoeken via [open-meteo.com](https://open-meteo.com/en/docs)) |
| `system.disks` | Schijven die je wilt zien. De root van de host staat op `/host/root`. Extra schijf? Mount bijv. `/mnt/data:/host/mnt/data:ro` en voeg `path: /host/mnt/data` toe |
| `docker.allowActions` | `true` = start/stop/herstart-knoppen |
| `services` | Groepen met apps. `icon` = naam uit [dashboard-icons](https://github.com/walkxcode/dashboard-icons), emoji, URL of `/icons/bestand.png` (in `config/icons/`) |
| `check` | `false` = geen statuscheck, of een ander adres om te checken |
| `widgets` | Losse widgets aan/uit (`world: false` verbergt het Wereld-tabblad, `earth: false` zet de aarde bovenaan uit) |

### Omgevingsvariabelen

| Variabele | Uitleg |
|---|---|
| `AUTH_USER` / `AUTH_PASSWORD` | Zet beide om inloggen aan te zetten |
| `HOST_NAME` | Naam die bij "Server" wordt getoond |
| `TZ` | Tijdzone, standaard `Europe/Amsterdam` |
| `PORT` | Poort in de container (standaard 3000) |

## Beveiliging

- De Docker-socket geeft de container volledige controle over Docker. Wil je dat niet, haal die regel weg uit `docker-compose.yml` en zet `docker.enabled: false`.
- Zet het dashboard niet zonder `AUTH_USER`/`AUTH_PASSWORD` (of een reverse proxy met login) open op internet.

## Lokaal ontwikkelen

```bash
npm install
npm start
```
