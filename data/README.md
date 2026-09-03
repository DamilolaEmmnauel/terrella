# data

`countries-110m.json` is the 1:110m world atlas from
[world-atlas](https://github.com/topojson/world-atlas), built from Natural Earth,
which is public domain. Country ids are ISO 3166-1 numeric codes.

Swap in `countries-50m.json` from the same project for more coastline detail at
about four times the size.

`iso3166.csv` is the ISO 3166-1 country table with UN M49 region columns, from
[lukes/ISO-3166-Countries-with-Regional-Codes](https://github.com/lukes/ISO-3166-Countries-with-Regional-Codes)
(CC BY-SA 4.0). `npm run iso3166` turns it into `src/data/iso3166.ts`.
