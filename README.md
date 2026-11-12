# Ziellinie: dein Trainingsplan

Kostenloser Trainingsplan für drei Sportarten:

- **Laufen:** 5 km, 10 km, Halbmarathon, Marathon
- **Radfahren:** 50, 100, 160 und 200 km, optional mit FTP, Gewicht und Gelände
- **Schwimmen:** 750 m, 1,5 km, 2,5 km, 3,8 km, optional mit Bestzeit

Du gibst Sportart, Strecke, Zielzeit, Zieldatum und deinen heutigen Umfang an. Du bekommst einen Wochenplan mit Tempo bzw. Leistung für jede Einheit, ein Diagramm des Wochenumfangs und eine ehrliche Einschätzung, ob dein Ziel in der Zeit passt. Export als Kalenderdatei (.ics), Tabelle (.csv) und zum Drucken. Direktlinks: `#rad`, `#schwimmen`.

Alles läuft im Browser. Es werden keine Eingaben gesendet oder gespeichert.

## Rechenkern (plan.js) für Node

`plan.js` läuft im Browser (`window.Laufplan`) und unter Node (`require('./plan.js')`).

- Laufen wie bisher: `buildPlan({ dist: '21', goalMin, weeks, runs, curKm, raceDate, ref, kraft })`. Ohne `sport` liefert `buildPlan` exakt dieselben Ergebnisse wie vor dem Multisport-Umbau.
- Rad: `buildPlan({ sport: 'rad', dist: '100', goalMin, weeks, runs: 3, curKm, raceDate, ftp, weightKg, terrain: 'flach' | 'huegelig' | 'bergig' })`
- Schwimmen: `buildPlan({ sport: 'schwimmen', dist: '1.5', goalMin, weeks, runs: 3, curKm, raceDate, ref: { d: 0.4, min } })` (Umfang in km)
- Zeit eingeben: `parseTimeFor('4:00', 100, 'rad')`, `parseTimeFor('35:00', 1.5, 'schwimmen')`. Ohne dritten Parameter wie bisher fürs Laufen.
- Metadaten für Oberflächen: `sportInfo('rad')`, `SPORTS`. Rad- und Schwimmpläne haben zusätzlich `sport`, `zones`, `sessWord`, `raceText`, je Einheit `chip` und `amount`.
- `toICS` funktioniert für alle Sportarten. Den Garmin-Export gibt es nur fürs Laufen.

## Faustwerte und Quellen

Laufen: Riegel-Formel (Exponent 1,06), Steigerung höchstens 9 % pro Woche, jede vierte Woche leichter.

Rad:
- Leistungsbereiche nach Coggan in % FTP (Grundlage 56–75, Tempo 76–87, Sweet Spot 88–94, Schwelle 95–105, VO2max 106–120): [TrainerRoad](https://www.trainerroad.com/blog/?p=33200), [Rouvy](https://rouvy.com/blog/how-to-create-a-workout), [ctyeh.com](https://ctyeh.com/articles/959?lang=en)
- Längste Ausfahrt etwa 75 bis 85 % der Strecke, 5 bis 10 Stunden pro Woche, Taper 1 bis 2 Wochen, höchstens 5 bis 10 % mehr pro Woche: [runbikecalc](https://runbikecalc.com/blog/century-ride-training-complete-guide), [TrainingPeaks](https://www.trainingpeaks.com/blog/best-cycling-training-plans-for-centuries-and-grand-fondos/), [TrainRight](https://trainright.com/training-and-preparing-for-your-first-century-ride)
- Tempo aus Leistung: Fahrphysik nach Martin et al. (1998), Oberlenker CdA 0,32, Rollwiderstand 0,005, Luftdichte 1,2: [fitmetriclab](https://fitmetriclab-com.pages.dev/en/tools/cycling/cycling-power/), [calculate.co.nz](https://www.calculate.co.nz/cycling-power-calculator.php)
- Haltbarer Anteil der FTP über mehrere Stunden (Annahme Hobbysport: 2 h ≈ 83 %, 4 h ≈ 74 %, 6 h ≈ 69 %): [semiprocycling](https://www.semiprocycling.com/playbook/durability/why-your-ftp-drops-after-two-hours), [biketips](https://biketips.com/ftp-testing-training-zones-cyclists/)

Schwimmen:
- Kritische Schwimmgeschwindigkeit (CSS) und Bereiche um CSS: [Swim Smooth](https://blog.swimsmooth.com/p/understanding-training-zones), [Mid Sussex Tri Club](https://midsussextriclub.com/training-zone/training-articles/what-is-critical-swim-speed-and-how-to-use-it/)
- Umfang und Aufbau bis 3,8 km, höchstens 10 bis 15 % mehr pro Woche, Taper: [ctyeh.com](https://ctyeh.com/articles/3663?lang=en), [TrainingPeaks 3,8-km-Pläne](https://www.trainingpeaks.com/training-plans/other/swimming/tp-227271/2-4-mile-3-8km-distance-swimming-training-plan-intermediate)
- Bestzeit umrechnen mit der Riegel-Formel (gilt laut Riegel auch fürs Schwimmen): [Wikipedia: Peter Riegel](https://en.wikipedia.org/wiki/Peter_Riegel)

## Hinweis
Die Pläne sind Rechenbeispiele mit Faustwerten und keine medizinische oder sportwissenschaftliche Beratung. Bei Beschwerden oder nach langer Pause sprich vorher mit einer Ärztin oder einem Arzt. Training auf eigene Verantwortung.
