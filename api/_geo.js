// Date geografice pentru afișarea traseului (vămi și localități). Doar pentru informare: nu intră în calculul km sau al taxelor.
// Prefixul „_” face ca Vercel să nu trateze fișierul ca endpoint. Coordonatele sunt aproximative (±2–3 km).

// Puncte de trecere a frontierei: „nume|lat|lon|țara A|țara B”. Se potrivesc doar pe perechea de țări a trecerii detectate.
const BORDER_SRC = `
Petea – Csengersima|47.93|22.49|RO|HU
Borș – Biharkeresztes|47.13|21.80|RO|HU
Nădlac II – Csanádpalota|46.19|20.76|RO|HU
Salonta – Méhkerék|46.80|21.52|RO|HU
Vărșand – Gyula|46.64|21.30|RO|HU
Cenad – Kiszombor|46.15|20.60|RO|HU
Valea lui Mihai – Nyírábrány|47.53|22.15|RO|HU
Giurgiu – Ruse|43.88|25.96|RO|BG
Calafat – Vidin|43.99|22.93|RO|BG
Hegyeshalom – Nickelsdorf|47.92|17.11|HU|AT
Sopron – Klingenbach|47.69|16.55|HU|AT
Rajka – Čunovo|48.00|17.19|HU|SK
Komárom – Komárno|47.76|18.13|HU|SK
Tornyosnémeti – Milhosť|48.56|20.84|HU|SK
Sátoraljaújhely – Slovenské Nové Mesto|48.39|21.66|HU|SK
Záhony – Čierna nad Tisou|48.41|22.14|HU|SK
Berg – Petržalka|48.12|17.05|AT|SK
Brodské – Lanžhot|48.72|17.00|SK|CZ
Holíč – Hodonín|48.81|17.18|SK|CZ
Mosty u Jablunkova – Svrčinovec|49.55|18.77|SK|CZ
Skalité – Zwardoń|49.52|18.97|SK|PL
Trstená – Chyżne|49.42|19.46|SK|PL
Vyšný Komárnik – Barwinek|49.43|21.78|SK|PL
Mikulov – Drasenhofen|48.79|16.64|CZ|AT
Dolní Dvořiště – Wullowitz|48.62|14.42|CZ|AT
Rozvadov – Waidhaus|49.66|12.55|CZ|DE
Folmava – Furth im Wald|49.30|12.84|CZ|DE
Krásný Les – Breitenau|50.77|13.93|CZ|DE
Hřensko – Schmilka|50.87|14.22|CZ|DE
Bohumín – Chałupki|49.90|18.31|CZ|PL
Český Těšín – Cieszyn|49.75|18.62|CZ|PL
Świecko – Frankfurt (Oder)|52.34|14.60|PL|DE
Jędrzychowice – Ludwigsdorf|51.18|14.94|PL|DE
Zgorzelec – Görlitz|51.15|14.99|PL|DE
Gubin – Guben|51.95|14.73|PL|DE
Kołbaskowo – Pomellen|53.23|14.37|PL|DE
Walserberg – Salzburg|47.80|12.98|DE|AT
Suben – Passau|48.43|13.42|DE|AT
Kufstein – Kiefersfelden|47.62|12.18|DE|AT
Simbach – Braunau|48.26|13.03|DE|AT
Venlo – Straelen|51.35|6.13|DE|NL
Elten – Emmerich|51.86|6.12|DE|NL
Oldenzaal – Bad Bentheim|52.30|7.04|DE|NL
Kerkrade – Herzogenrath|50.87|6.07|DE|NL
Aachen – Lichtenbusch|50.74|6.08|DE|BE
Kehl – Strasbourg|48.57|7.81|DE|FR
Saarbrücken – Forbach|49.19|7.01|DE|FR
Hazeldonk – Meer|51.46|4.76|NL|BE
Lanaken – Maastricht|50.84|5.70|NL|BE
Brenner – Brennero|47.00|11.51|AT|IT
Arnoldstein – Tarvisio|46.51|13.69|AT|IT
Spielfeld – Šentilj|46.69|15.63|AT|SI
Budzisko – Kalvarija|54.08|23.04|PL|LT
Kulata – Promachonas|41.39|23.36|BG|GR
`

// Localități: o linie per țară, „nume,lat,lon” separate prin „;”. Prefixul „*” = oraș mare / important (se afișează mai larg).
const TOWN_SRC = {
  RO: `*București,44.43,26.10;Ploiești,44.94,26.03;*Brașov,45.65,25.60;*Sibiu,45.80,24.15;Alba Iulia,46.07,23.57;*Cluj-Napoca,46.77,23.59;*Oradea,47.05,21.92;*Satu Mare,47.79,22.88;Baia Mare,47.66,23.57;*Timișoara,45.75,21.23;*Arad,46.18,21.32;Deva,45.88,22.91;Lugoj,45.69,21.90;Turda,46.57,23.78;Zalău,47.19,23.06;Pitești,44.86,24.87;Râmnicu Vâlcea,45.10,24.37;Târgu Mureș,46.54,24.56;Bacău,46.57,26.91;*Iași,47.16,27.59;Suceava,47.65,26.26;*Constanța,44.18,28.65;*Craiova,44.32,23.80;Buzău,45.15,26.83;Focșani,45.70,27.18;Galați,45.44,28.05;Brăila,45.27,27.97;Giurgiu,43.90,25.97;Mediaș,46.17,24.35;Făgăraș,45.84,24.97;Sebeș,45.96,23.57;Carei,47.69,22.47;Târgu Jiu,45.04,23.27;Drobeta-Turnu Severin,44.63,22.66;Reșița,45.30,21.89;Bistrița,47.13,24.50;Piatra Neamț,46.93,26.37;Slatina,44.43,24.37;Alexandria,43.97,25.33;Călărași,44.20,27.33;Urziceni,44.72,26.64;Salonta,46.80,21.65;Beiuș,46.66,22.35;Huedin,46.86,23.04;Săcueni,47.35,22.09;Nădlac,46.17,20.75;Calafat,43.99,22.93`,
  HU: `*Budapest,47.50,19.04;*Debrecen,47.53,21.63;*Szeged,46.25,20.15;*Győr,47.69,17.63;*Miskolc,48.10,20.78;Nyíregyháza,47.95,21.72;Kecskemét,46.91,19.69;Székesfehérvár,47.19,18.41;Szolnok,47.18,20.19;Békéscsaba,46.68,21.09;Hajdúszoboszló,47.45,21.39;Berettyóújfalu,47.22,21.54;Mosonmagyaróvár,47.87,17.27;Tatabánya,47.58,18.40;Eger,47.90,20.38;Gyöngyös,47.78,19.93;Hatvan,47.67,19.68;Makó,46.22,20.48;Hódmezővásárhely,46.42,20.33;Komárom,47.74,18.12;Kaposvár,46.36,17.80;Pécs,46.07,18.23;Sopron,47.68,16.59;Szombathely,47.23,16.62;Veszprém,47.09,17.91;Nagykanizsa,46.46,16.99;Zalaegerszeg,46.84,16.84;Püspökladány,47.32,21.12;Mezőkövesd,47.82,20.57;Szentes,46.65,20.26;Orosháza,46.57,20.67;Csongrád,46.71,20.14`,
  SK: `*Bratislava,48.15,17.11;*Košice,48.72,21.26;*Žilina,49.22,18.74;Nitra,48.31,18.09;Trnava,48.38,17.59;Prešov,49.00,21.24;Banská Bystrica,48.74,19.15;Trenčín,48.89,18.04;Martin,49.07,18.92;Poprad,49.06,20.30;Zvolen,48.58,19.12;Lučenec,48.33,19.67;Michalovce,48.76,21.92;Levice,48.22,18.60;Komárno,47.76,18.13;Dunajská Streda,47.99,17.62;Nové Zámky,47.99,18.16;Púchov,49.12,18.33;Ružomberok,49.08,19.31;Liptovský Mikuláš,49.08,19.61;Senec,48.22,17.40;Rimavská Sobota,48.38,20.00;Rožňava,48.66,20.53;Trebišov,48.63,21.72;Žiar nad Hronom,48.59,18.85;Trstená,49.36,19.61;Čadca,49.44,18.79;Skalica,48.85,17.23;Senica,48.68,17.37;Piešťany,48.59,17.83`,
  CZ: `*Praha,50.08,14.44;*Brno,49.20,16.61;*Ostrava,49.83,18.28;Plzeň,49.75,13.38;Olomouc,49.59,17.25;Hradec Králové,50.21,15.83;Pardubice,50.04,15.78;Jihlava,49.40,15.59;České Budějovice,48.97,14.47;Ústí nad Labem,50.66,14.04;Liberec,50.77,15.06;Zlín,49.22,17.66;Karlovy Vary,50.23,12.87;Přerov,49.46,17.45;Hodonín,48.85,17.13;Břeclav,48.76,16.88;Frýdek-Místek,49.68,18.35;Havířov,49.78,18.43;Karviná,49.85,18.54;Teplice,50.64,13.82;Most,50.50,13.64;Mladá Boleslav,50.41,14.90;Kladno,50.15,14.10;Cheb,50.08,12.37;Znojmo,48.86,16.05;Třebíč,49.21,15.88;Prostějov,49.47,17.11;Vyškov,49.28,17.00;Havlíčkův Brod,49.61,15.58;Tábor,49.41,14.68;Bohumín,49.90,18.36;Hranice,49.55,17.73;Valašské Meziříčí,49.47,17.97;Humpolec,49.54,15.36;Jablonec nad Nisou,50.72,15.17;Mohelnice,49.78,16.92;Studénka,49.72,18.08`,
  PL: `*Warszawa,52.23,21.01;*Kraków,50.06,19.94;*Łódź,51.76,19.46;*Wrocław,51.11,17.04;*Poznań,52.41,16.93;*Gdańsk,54.35,18.65;*Katowice,50.26,19.02;*Szczecin,53.43,14.55;*Lublin,51.25,22.57;Bydgoszcz,53.12,18.01;Białystok,53.13,23.17;*Rzeszów,50.04,21.99;Toruń,53.01,18.60;Kielce,50.87,20.63;Opole,50.67,17.93;Zielona Góra,51.94,15.51;Częstochowa,50.81,19.12;Gliwice,50.29,18.67;Bielsko-Biała,49.82,19.06;Tarnów,50.01,20.99;Bolesławiec,51.26,15.57;Legnica,51.21,16.16;Konin,52.22,18.25;Piotrków Trybunalski,51.41,19.70;Września,52.33,17.57;Rybnik,50.10,18.55;Cieszyn,49.75,18.63;Nowy Sącz,49.62,20.70;Przemyśl,49.78,22.77;Zgorzelec,51.15,15.01;Jelenia Góra,50.90,15.73;Olsztyn,53.78,20.49;Radom,51.40,21.15;Płock,52.55,19.70;Kalisz,51.76,18.09;Leszno,51.84,16.57;Gorzów Wielkopolski,52.74,15.23;Koszalin,54.19,16.17;Suwałki,54.10,22.93;Ostrów Wielkopolski,51.65,17.81;Wałbrzych,50.78,16.28;Piła,53.15,16.74;Gniezno,52.53,17.59;Sosnowiec,50.29,19.13;Nowy Targ,49.48,20.03;Chrzanów,50.14,19.40;Brzeg,50.86,17.47;Krosno,49.69,21.77;Sanok,49.56,22.21;Jasło,49.75,21.47;Dębica,50.05,21.41;Świebodzin,52.25,15.53;Nowy Tomyśl,52.31,16.12;Kutno,52.23,19.36;Stryków,51.90,19.60`,
  DE: `*Berlin,52.52,13.40;*Hamburg,53.55,9.99;*München,48.14,11.58;*Köln,50.94,6.96;*Frankfurt am Main,50.11,8.68;*Stuttgart,48.78,9.18;*Düsseldorf,51.23,6.78;*Dortmund,51.51,7.47;Essen,51.46,7.01;*Leipzig,51.34,12.37;*Dresden,51.05,13.74;*Hannover,52.37,9.73;*Nürnberg,49.45,11.08;Bremen,53.08,8.80;Duisburg,51.43,6.76;Bochum,51.48,7.22;Wuppertal,51.26,7.15;Bielefeld,52.02,8.53;Bonn,50.73,7.10;Münster,51.96,7.63;Karlsruhe,49.01,8.40;Mannheim,49.49,8.47;Augsburg,48.37,10.90;Wiesbaden,50.08,8.24;Kassel,51.31,9.50;Regensburg,49.02,12.10;Passau,48.57,13.43;Würzburg,49.79,9.95;Erfurt,50.98,11.03;Magdeburg,52.13,11.63;Chemnitz,50.83,12.92;Görlitz,51.15,14.99;Cottbus,51.76,14.33;Bayreuth,49.94,11.58;Ulm,48.40,9.99;Heilbronn,49.14,9.22;Göttingen,51.53,9.94;Osnabrück,52.28,8.05;Oldenburg,53.14,8.21;Hof,50.31,11.92;Aachen,50.78,6.08;Oberhausen,51.47,6.85;Halle (Saale),51.48,11.97;Bamberg,49.89,10.89;Ingolstadt,48.76,11.42;Kempten,47.73,10.31;Freiburg,47.99,7.85;Kiel,54.32,10.14;Rostock,54.09,12.10;Lübeck,53.87,10.69;Braunschweig,52.27,10.52;Fulda,50.55,9.68;Gießen,50.58,8.68;Koblenz,50.36,7.59;Trier,49.76,6.64;Saarbrücken,49.24,7.00;Hamm,51.68,7.82;Krefeld,51.34,6.59;Mönchengladbach,51.19,6.44;Bautzen,51.18,14.42;Gera,50.88,12.08;Wolfsburg,52.42,10.79;Salzgitter,52.15,10.33;Hildesheim,52.15,9.95;Paderborn,51.72,8.75;Gütersloh,51.91,8.38;Hagen,51.36,7.47;Leverkusen,51.03,6.98;Neuss,51.20,6.69;Rosenheim,47.86,12.12;Traunstein,47.87,12.64;Straubing,48.88,12.57;Deggendorf,48.83,12.96;Landshut,48.54,12.15;Erlangen,49.60,11.00;Frankfurt (Oder),52.34,14.55;Eisenach,50.98,10.32;Bad Hersfeld,50.87,9.70`,
  AT: `*Wien,48.21,16.37;*Graz,47.07,15.44;*Linz,48.31,14.29;*Salzburg,47.81,13.04;*Innsbruck,47.27,11.39;Klagenfurt,46.62,14.31;St. Pölten,48.20,15.63;Villach,46.61,13.85;Wels,48.16,14.03;Bregenz,47.50,9.75;Bruck an der Mur,47.41,15.27;Amstetten,48.12,14.87;Kufstein,47.58,12.17;Wörgl,47.49,12.07;Neusiedl am See,47.95,16.84;Eisenstadt,47.85,16.52;Wiener Neustadt,47.81,16.24;Krems,48.41,15.60;Ried im Innkreis,48.21,13.49;Vöcklabruck,48.01,13.66;Leoben,47.38,15.09;Hallein,47.68,13.10`,
  NL: `*Amsterdam,52.37,4.90;*Rotterdam,51.92,4.48;*Utrecht,52.09,5.12;*Eindhoven,51.44,5.47;*Tilburg,51.56,5.09;*Breda,51.59,4.78;Arnhem,51.98,5.91;Nijmegen,51.84,5.85;'s-Hertogenbosch,51.70,5.30;Venlo,51.37,6.17;Waalwijk,51.69,5.07;Den Haag,52.08,4.31;Maastricht,50.85,5.69;Zwolle,52.51,6.09;Enschede,52.22,6.89;Groningen,53.22,6.57;Apeldoorn,52.21,5.97;Roermond,51.19,5.99;Venray,51.53,5.98;Helmond,51.48,5.66;Oss,51.77,5.52;Deventer,52.25,6.16;Almelo,52.36,6.66;Hengelo,52.27,6.79;Born,51.03,5.81;Sittard-Geleen,51.00,5.86`,
  BE: `*Bruxelles,50.85,4.35;*Antwerpen,51.22,4.40;Gent,51.05,3.72;Liège,50.63,5.57;Charleroi,50.41,4.44;Brugge,51.21,3.22;Leuven,50.88,4.70;Hasselt,50.93,5.34;Mechelen,51.03,4.48;Namur,50.47,4.87;Kortrijk,50.83,3.27;Aalst,50.94,4.04;Lommel,51.23,5.31`,
  LT: `*Vilnius,54.69,25.28;*Kaunas,54.90,23.89;Klaipėda,55.71,21.14;Šiauliai,55.93,23.31;Panevėžys,55.73,24.36;Marijampolė,54.56,23.35;Alytus,54.40,24.04;Kalvarija,54.41,23.23;Vilkaviškis,54.65,23.04;Kėdainiai,55.29,23.97;Jonava,55.07,24.28;Utena,55.50,25.60`,
  LV: `*Riga,56.95,24.11;Jelgava,56.65,23.72;Daugavpils,55.87,26.54;Liepāja,56.51,21.01;Bauska,56.41,24.19;Ogre,56.82,24.60`,
  EE: `*Tallinn,59.44,24.75;Tartu,58.38,26.72;Pärnu,58.38,24.50;Valga,57.78,26.05`,
  BG: `*Sofia,42.70,23.32;Plovdiv,42.14,24.75;Varna,43.21,27.91;Burgas,42.50,27.47;*Ruse,43.85,25.95;Stara Zagora,42.43,25.64;Pleven,43.42,24.62;Veliko Tarnovo,43.08,25.65;Vidin,43.99,22.88;Montana,43.41,23.23;Vratsa,43.20,23.55;Haskovo,41.93,25.56;Svilengrad,41.77,26.20;Sliven,42.68,26.33;Shumen,43.27,26.93;Gabrovo,42.87,25.32;Dimitrovgrad,42.05,25.60`,
  GR: `Thessaloniki,40.64,22.94;Athina,37.98,23.73;Serres,41.09,23.55`,
  IT: `*Trieste,45.65,13.78;*Venezia,45.44,12.32;Padova,45.41,11.88;*Verona,45.44,10.99;Brescia,45.54,10.22;*Milano,45.46,9.19;*Torino,45.07,7.69;*Bologna,44.49,11.34;Udine,46.06,13.24;Vicenza,45.55,11.55;Bolzano,46.50,11.35;Trento,46.07,11.12;Modena,44.65,10.93;Parma,44.80,10.33;Piacenza,45.05,9.69;Genova,44.41,8.93;Firenze,43.77,11.26;Roma,41.90,12.50;Napoli,40.85,14.27;Bergamo,45.70,9.67;Novara,45.45,8.62;Tarvisio,46.50,13.58;Gorizia,45.94,13.62;Treviso,45.67,12.24;Ravenna,44.42,12.20;Rimini,44.06,12.57;Ancona,43.62,13.52;Bari,41.12,16.87;Livorno,43.55,10.31;Pisa,43.72,10.40;Alessandria,44.91,8.61;Asti,44.90,8.21;Cremona,45.13,10.02;Mantova,45.16,10.79;Ferrara,44.84,11.62;Reggio nell'Emilia,44.70,10.63;Pordenone,45.96,12.66;Bressanone,46.72,11.66`,
  SI: `*Ljubljana,46.06,14.51;Maribor,46.56,15.65;Celje,46.24,15.27;Koper,45.55,13.73;Kranj,46.24,14.36;Novo Mesto,45.80,15.17;Postojna,45.78,14.21;Nova Gorica,45.96,13.65;Murska Sobota,46.66,16.17`,
  HR: `*Zagreb,45.81,15.98;Rijeka,45.33,14.44;Split,43.51,16.44;Osijek,45.55,18.69;Slavonski Brod,45.16,18.02;Varaždin,46.31,16.34;Zadar,44.12,15.23;Karlovac,45.49,15.55;Pula,44.87,13.85`,
  FR: `*Paris,48.86,2.35;*Lyon,45.76,4.84;*Marseille,43.30,5.37;*Strasbourg,48.57,7.75;*Lille,50.63,3.06;Metz,49.12,6.18;Nancy,48.69,6.18;Reims,49.26,4.03;Mulhouse,47.75,7.34;Dijon,47.32,5.04;*Bordeaux,44.84,-0.58;*Toulouse,43.60,1.44;Nantes,47.22,-1.55;Nice,43.70,7.27;Montpellier,43.61,3.88;Grenoble,45.19,5.72;Besançon,47.24,6.02;Calais,50.95,1.86;Orléans,47.90,1.91;Tours,47.39,0.69;Clermont-Ferrand,45.78,3.09;Avignon,43.95,4.81;Nîmes,43.84,4.36;Valence,44.93,4.89;Chambéry,45.57,5.92;Troyes,48.30,4.08;Mâcon,46.31,4.83;Chalon-sur-Saône,46.78,4.85;Beaune,47.02,4.84;Amiens,49.89,2.30;Rouen,49.44,1.10;Le Mans,48.00,0.20;Rennes,48.11,-1.68;Angers,47.47,-0.55;Poitiers,46.58,0.34;Limoges,45.83,1.26;Perpignan,42.70,2.90;Arles,43.68,4.63;Aix-en-Provence,43.53,5.45;Colmar,48.08,7.36;Saint-Quentin,49.85,3.29`,
  ES: `*Madrid,40.42,-3.70;*Barcelona,41.39,2.17;*Valencia,39.47,-0.38;Zaragoza,41.65,-0.89;Sevilla,37.39,-5.98;Bilbao,43.26,-2.93;Girona,41.98,2.82;Tarragona,41.12,1.25;Irun,43.34,-1.79;Burgos,42.34,-3.70;Valladolid,41.65,-4.72;Málaga,36.72,-4.42;Lleida,41.62,0.62;Pamplona,42.82,-1.64;Figueres,42.27,2.96`,
  PT: `*Lisboa,38.72,-9.14;*Porto,41.15,-8.61;Coimbra,40.21,-8.43;Braga,41.55,-8.42;Faro,37.02,-7.93;Évora,38.57,-7.91`,
  DK: `*København,55.68,12.57;Odense,55.40,10.39;Aarhus,56.16,10.20;Aalborg,57.05,9.92;Kolding,55.49,9.47;Vejle,55.71,9.54;Padborg,54.82,9.36`,
  SE: `*Stockholm,59.33,18.07;*Göteborg,57.71,11.97;*Malmö,55.60,13.00;Helsingborg,56.05,12.69;Jönköping,57.78,14.16;Örebro,59.27,15.21;Norrköping,58.59,16.19`,
  FI: `*Helsinki,60.17,24.94;Turku,60.45,22.27;Tampere,61.50,23.76`,
  LU: `*Luxembourg,49.61,6.13`,
  IE: `*Dublin,53.35,-6.26;Cork,51.90,-8.47`,
}

// Orașe „mari” (pragul de potrivire cu ruta e mai larg): cele cu prefix „*” din TOWN_SRC.

const parseBorders = () => BORDER_SRC.trim().split('\n').map((l) => { const [name, lat, lon, a, b] = l.split('|'); return { name, lat: +lat, lon: +lon, a, b } })
const parseTowns = () => {
  const out = []
  for (const [c, src] of Object.entries(TOWN_SRC)) for (const t of src.split(';')) {
    const big = t.startsWith('*')
    const [name, lat, lon] = (big ? t.slice(1) : t).split(',')
    out.push({ name, c, lat: +lat, lon: +lon, big })
  }
  return out
}
const BORDERS = parseBorders()
const TOWNS = parseTowns()

const RAD = Math.PI / 180
const hav = (lat1, lon1, lat2, lon2) => {
  const dLa = (lat2 - lat1) * RAD, dLo = (lon2 - lon1) * RAD
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLo / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

// Distanța (km) de la un punct la ruta (punct–segment) și indexul segmentului cel mai apropiat.
function nearestOnRoute(pts, lat, lon, stride) {
  const kx = Math.cos(lat * RAD) * 111.32, ky = 110.57
  let best = Infinity, bi = 0
  for (let i = 0; i < pts.length; i += stride) {
    const dx = (pts[i][0] - lon) * kx, dy = (pts[i][1] - lat) * ky
    const d = dx * dx + dy * dy
    if (d < best) { best = d; bi = i }
  }
  // rafinare: segmentele din jurul celui mai apropiat vârf
  let bestD = Math.sqrt(best), bestI = bi
  const lo = Math.max(0, bi - stride - 1), hi = Math.min(pts.length - 2, bi + stride)
  for (let i = lo; i <= hi; i++) {
    const ax = (pts[i][0] - lon) * kx, ay = (pts[i][1] - lat) * ky, bx = (pts[i + 1][0] - lon) * kx, by = (pts[i + 1][1] - lat) * ky
    const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy
    const t = L ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / L)) : 0
    const d = Math.hypot(ax + t * vx, ay + t * vy)
    if (d < bestD) { bestD = d; bestI = i }
  }
  return { d: bestD, i: bestI }
}

// Traseul pe scurt: vămile (trecerile de frontieră) și localitățile mari de pe rută, în ordinea parcurgerii.
// pts = [[lon, lat], …]; segs = [[de_la, până_la, cod țară], …] (în ordinea rutei); totalKm = distanța oficială a rutei.
export function routeVia(pts, segs, totalKm) {
  if (!pts?.length || !segs?.length) return null
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1][1], pts[i - 1][0], pts[i][1], pts[i][0]))
  const scale = totalKm / (cum[cum.length - 1] || 1)
  const kmAt = (i) => Math.round(cum[Math.min(i, cum.length - 1)] * scale)

  const items = []
  const border = []
  // treceri de frontieră: unde se schimbă țara între segmente consecutive
  let prev = null
  for (const [a, , code] of segs) {
    if (!code || code.startsWith('?')) continue
    if (prev && prev !== code) {
      const p = pts[Math.min(a, pts.length - 1)]
      const hit = BORDERS.filter((b) => (b.a === prev && b.b === code) || (b.a === code && b.b === prev)).map((b) => ({ b, d: hav(b.lat, b.lon, p[1], p[0]) })).sort((x, y) => x.d - y.d)[0]
      const named = hit && hit.d <= 25 ? hit.b.name : null
      border.push({ t: 'border', n: named, pair: `${prev}/${code}`, km: kmAt(a), lat: p[1], lon: p[0] })
    }
    prev = code
  }
  items.push(...border)

  // localități: aproape de rută, doar țările prin care trece ruta
  const countries = new Set(segs.map((s) => s[2]))
  const stride = Math.max(1, Math.floor(pts.length / 4000))
  const towns = []
  for (const t of TOWNS) {
    if (!countries.has(t.c)) continue
    const r = nearestOnRoute(pts, t.lat, t.lon, stride)
    if (r.d <= (t.big ? 12 : 5)) towns.push({ t: 'city', n: t.name, c: t.c, km: kmAt(r.i), big: t.big, lat: t.lat, lon: t.lon })
  }
  towns.sort((x, y) => x.km - y.km)
  // evit aglomerarea: orașele mici doar la ≥ 35 km de ultimul afișat, cele mari la ≥ 12 km
  const kept = []
  let last = -1e9
  const bordersKm = border.map((b) => b.km)
  for (const t of towns) {
    const gap = t.big ? 12 : 35
    const nearBorder = bordersKm.some((k) => Math.abs(k - t.km) < 8)
    if (t.km - last >= gap && !nearBorder) { kept.push(t); last = t.km }
  }
  items.push(...kept)
  items.sort((x, y) => x.km - y.km)

  // Link Google Maps: început, sfârșit și punctele de frontieră ca opriri (max. 8)
  const f = (n) => Number(n).toFixed(5)
  const o = pts[0], d = pts[pts.length - 1]
  let wps = border.filter((b) => b.km > 3 && b.km < totalKm - 3).map((b) => `${f(b.lat)},${f(b.lon)}`)
  if (wps.length > 8) wps = wps.filter((_, i) => i % Math.ceil(wps.length / 8) === 0).slice(0, 8)
  const gmaps = `https://www.google.com/maps/dir/?api=1&origin=${f(o[1])},${f(o[0])}&destination=${f(d[1])},${f(d[0])}${wps.length ? `&waypoints=${wps.join('%7C')}` : ''}&travelmode=driving`

  return { items: items.slice(0, 40).map(({ t, n, c, pair, km, big }) => ({ t, n, ...(c ? { c } : {}), ...(pair ? { pair } : {}), km, ...(big ? { big: 1 } : {}) })), gmaps }
}
