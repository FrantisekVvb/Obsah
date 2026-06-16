# Obsah

Interaktivní webová aplikace pro práci s plochou (dm², cm², mm²).

## Spuštění online

Po nasazení na GitHub Pages je aplikace dostupná na:

**https://frantisekvvb.github.io/Obsah/**

## Spuštění lokálně

Potřebuješ [Node.js](https://nodejs.org/) 18 nebo novější.

```bash
git clone https://github.com/FrantisekVvb/Obsah.git
cd Obsah
npm start
```

Aplikace poběží na adrese **http://localhost:3470**.

Alternativa bez Node.js — v kořeni projektu spusť libovolný statický server, například:

```bash
python3 -m http.server 3470
```

a otevři **http://localhost:3470**.

## Ovládání

- **Nový obdélník** — vygeneruje náhodný šedý obdélník (1–6 dm × 1–3 dm)
- **Volná plocha** — režim bez obdélníku, dlaždice lze volně pokládat
- Zásobník dlaždic pod tlačítky — přetáhni zelenou (1 dm²), modrou (1 cm²) nebo červenou (1 mm²) dlaždici na plochu
