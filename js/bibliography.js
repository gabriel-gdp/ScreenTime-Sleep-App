// bibliography.js — Fondamento scientifico (Fase 5, roadmap 5.4).
// Dati in forma JSON (solo valori letterali: nessuna funzione), inclusi
// nell'app e quindi consultabili offline.
//
// Fonte unica: docs/research/SCIENTIFIC_AUDIT.md (§2, §3, §7, §8), verifiche
// del 10–11/11/2026. Nessun dato è stato aggiunto rispetto a quel documento.
// Regole d'uso (SCIENTIFIC_AUDIT §8), verificate da tests/unit/bibliography:
// 1. numeri solo da fonti V1, con popolazione e disegno accanto;
// 2. fonti V2 solo in forma qualitativa, con "verifica in corso";
// 3. fonti NV ed ESCLUSE mai a sostegno; le pediatriche solo come contesto,
//    con il badge "studi su bambini e ragazzi";
// 4. nessuna fonte secondaria;
// 5. ogni collegamento dichiara se riguarda il fenomeno, il metodo o la
//    misura; nessuna fonte giustifica una formula che non ha studiato;
// 6. stato e data dell'ultima verifica per ogni fonte.
// Le prove della letteratura non compaiono mai nella stessa frase di un
// risultato personale (FINAL_ANALYTICS_SPEC §0).

export const BIBLIOGRAPHY_SOURCE = 'docs/research/SCIENTIFIC_AUDIT.md';

export const STATUS = {
  V1: { label: 'Verificata', detail: 'Abstract o articolo letto sulla fonte originale; numeri controllati.' },
  V2: { label: 'Verifica in corso', detail: 'Identità confermata da un indice; contenuto non riletto sulla fonte originale. Citata senza numeri.' },
  NV: { label: 'Non verificata', detail: 'Non trovata o identità incerta. Non usata.' },
  ESCLUSO: { label: 'Esclusa come prova per adulti', detail: 'Esiste, ma riguarda bambini o ragazzi, oppure non è revisionata. Al massimo contesto, con etichetta.' },
  APP: { label: "Verifica dell'app", detail: "Simulazioni su dati sintetici fatte per questa app: mostrano come si comporta il metodo, non dicono nulla sul sonno." },
};

// kind: 'phenomenon' (che cosa dice la letteratura sul fenomeno), 'method'
// (da dove viene una formula o una procedura), 'measurement' (qualità della
// misura). finding: solo per V1 (e APP), può contenere numeri; qualitative:
// per le altre, senza numeri.
export const SOURCES = [
  {
    id: 'zhong2025', short: 'Zhong et al. 2025', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'Zhong C, Masters M, Donzella SM, …, Diver WR, Patel AV',
    title: 'Electronic Screen Use and Sleep Duration and Timing in Adults',
    journal: 'JAMA Network Open 2025;8(3):e252493', doi: '10.1001/jamanetworkopen.2025.2493', pmid: '40146105',
    url: 'https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2831993',
    population: '122.058 adulti statunitensi di 27–85 anni (mediana 56), 80% donne', design: 'studio trasversale (coorte CPS-3)',
    finding: "Chi usava smartphone, laptop o tablet nell'ora prima del sonno tutti i giorni, rispetto a chi non li usava mai (modello completo), andava a dormire più tardi di 18,82 minuti nei giorni lavorativi (IC 95% 17,70–19,93) e di 19,69 minuti nei giorni liberi (18,56–20,81), e dormiva meno di 7,64 minuti nei giorni lavorativi (6,65–8,63) e di 5,04 minuti nei giorni liberi (4,03–6,05).",
    limits: "Confronto tra persone diverse, non tra notti della stessa persona; dati autoriferiti; campione selezionato.",
  },
  {
    id: 'exelmans2017', short: 'Exelmans e Van den Bulck 2017', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'Exelmans L, Van den Bulck J',
    title: 'Bedtime, shuteye time and electronic media: sleep displacement is a two-step process',
    journal: 'Journal of Sleep Research 2017;26(3):364–370', doi: '10.1111/jsr.12510', pmid: null,
    url: 'https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_proquest_miscellaneous_1875404963',
    population: '338 persone di 18–25 anni', design: 'studio trasversale online',
    finding: "In media passavano 39 minuti tra il momento in cui ci si mette a letto e quello in cui si prova a dormire; tempi più lunghi si associavano a una maggiore probabilità di dormire male, e questo tempo era legato all'uso di media prima di coricarsi.",
    limits: 'Campione di convenienza, giovani adulti, trasversale. Verificato sull\'abstract da catalogo.',
  },
  {
    id: 'combertaldi2021', short: 'Combertaldi et al. 2021', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'Combertaldi SL, Ort A, Cordi M, Fahr A, Rasch B',
    title: 'Pre-sleep social media use does not strongly disturb sleep: a sleep laboratory study in healthy young participants',
    journal: 'Sleep Medicine 2021;87:191–202', doi: '10.1016/j.sleep.2021.09.009', pmid: null,
    url: 'https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_proquest_miscellaneous_2580694114',
    population: '32 giovani sani', design: 'studio in laboratorio, ognuno in tre condizioni',
    finding: "30 minuti di social media prima di dormire non aumentavano in modo significativo l'attivazione e non disturbavano in modo forte il sonno (unica differenza: meno sonno di fase N2). Secondo gli autori, l'effetto principale è probabilmente il tempo sottratto al sonno.",
    limits: 'Laboratorio con luce controllata, 30 minuti, giovani. Verificato sull\'abstract da catalogo.',
  },
  {
    id: 'mcalpine2024', short: 'McAlpine et al. 2024', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'McAlpine T, Mullan B, Clarke PJF',
    title: 'Assessing the daily association of sleep hygiene behaviours with sleep: A between and within persons approach',
    journal: 'Journal of Behavioral Medicine 2024;47:255–270', doi: '10.1007/s10865-023-00448-0', pmid: '37702911',
    url: 'https://link.springer.com/content/pdf/10.1007/s10865-023-00448-0.pdf',
    population: '74 studenti (età media 22 anni)', design: '14 notti con actigrafia e diario, confronto notte per notte nella stessa persona',
    finding: "Nella stessa persona, l'uso dello schermo prima di dormire non era associato alla durata del sonno (B = 2,84 minuti, p = 0,51) né all'efficienza; lo schermo era però usato nel 90% delle notti, quindi le notti senza schermo erano poche.",
    limits: 'Giovani adulti, due settimane, poca variazione dell\'esposizione.',
  },
  {
    id: 'leger2024', short: 'Leger et al. 2024', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'Leger KA, Kim YK, Zhang S, Gao S, Fingerman KL',
    title: 'Daily Electronic Media Use and Sleep in Late Life',
    journal: 'Journals of Gerontology: Series B 2024;79(8):gbae095', doi: '10.1093/geronb/gbae095', pmid: null,
    url: 'https://academic.oup.com/psychsocgerontology/article/79/8/gbae095/7689231',
    population: '273 persone di 65–90 anni, 1.108 giorni', design: 'rilevazioni quotidiane, confronto nella stessa persona e tra persone',
    finding: "Nella stessa persona, nei giorni con uso del computer si dormiva meno; per la televisione non emergeva questa associazione.",
    limits: 'Anziani; misure brevi non validate; uso del computer in generale, non specificamente prima di dormire.',
  },
  {
    id: 'ellithorpe2022', short: 'Ellithorpe et al. 2022', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'Ellithorpe ME, Ulusoy E, Eden A, Hahn L, Yang C-L, Tucker RM',
    title: 'The complicated impact of media use before bed on sleep…',
    journal: 'Journal of Sleep Research 2022', doi: '10.1111/jsr.13551', pmid: null,
    url: 'https://udspace.udel.edu/items/fe6aae06-f723-4334-a31f-591e07ca4d2d/full',
    population: '58 adulti', design: 'diario dei media ed EEG del sonno',
    finding: "L'uso di media nell'ultima ora si associava a un coricamento più precoce, mentre la durata complessiva d'uso si associava a un coricamento più tardivo e a meno sonno.",
    limits: 'Campione piccolo; effetti numerici non letti (verificato sull\'abstract).',
  },
  {
    id: 'gradisar2013', short: 'Gradisar et al. 2013', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'Gradisar M, Wolfson AR, Harvey AG, Hale L, Rosenberg R, Czeisler CA',
    title: 'The sleep and technology use of Americans: … 2011 Sleep in America poll',
    journal: 'Journal of Clinical Sleep Medicine 2013;9(12):1291–1299', doi: '10.5664/jcsm.3272', pmid: '24340291',
    url: 'https://escholarship.org/content/qt6dp2p05q/qt6dp2p05q.pdf',
    population: '1.508 persone di 13–64 anni (comprende adolescenti)', design: 'sondaggio trasversale',
    finding: "Il 90% usava un dispositivo nell'ora prima di andare a letto; i dispositivi interattivi si associavano alla difficoltà di addormentarsi.",
    limits: 'Trasversale, autoriferito; comprende adolescenti.',
  },
  {
    id: 'bourke2026', short: 'Bourke et al. 2026', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: true,
    authors: 'Bourke M, Maddren CI, Sippel F, …, Thomas G',
    title: 'Within-Person Association Between Daily Screen Use and Sleep in Youth: A Systematic Review and Meta-Analysis',
    journal: 'JAMA Pediatrics 2026;180(5):500–509', doi: '10.1001/jamapediatrics.2025.6490', pmid: '41770550',
    url: 'https://jamanetwork.com/journals/jamapediatrics/article-abstract/2845524',
    population: '25 studi, 4.562 partecipanti di 3–25 anni', design: 'meta-analisi di confronti nella stessa persona',
    finding: "Nella stessa persona, l'uso degli schermi si associava a un addormentamento leggermente più tardo (r = 0,079); durata, tempo per addormentarsi ed efficienza non mostravano associazioni significative.",
    limits: 'Popolazione giovane: non è una prova diretta per adulti. Indica che gli effetti notte per notte sono piccoli.',
  },
  {
    id: 'parry2021', short: 'Parry et al. 2021', status: 'V1', verifiedOn: '2026-11-10', kind: 'measurement', pediatric: false,
    authors: 'Parry DA, Davidson BI, Sewall CJR, Fisher JT, Mieczkowski H, Quintana DS',
    title: 'A systematic review and meta-analysis of discrepancies between logged and self-reported digital media use',
    journal: 'Nature Human Behaviour 2021;5(11):1535–1547', doi: '10.1038/s41562-021-01117-5', pmid: null,
    url: 'https://experts.illinois.edu/en/publications/a-systematic-review-and-meta-analysis-of-discrepancies-between-lo/',
    population: '106 stime da studi diversi', design: 'meta-analisi',
    finding: "Le stime fatte a memoria sull'uso dei dispositivi corrispondono solo in parte ai registri automatici e sono raramente accurate.",
    limits: "Riguarda l'uso in generale, non l'orario dell'ultimo utilizzo.",
  },
  {
    id: 'fischer2021', short: 'Fischer et al. 2021', status: 'V1', verifiedOn: '2026-11-10', kind: 'method', pediatric: false,
    authors: 'Fischer D, Klerman EB, Phillips AJK',
    title: 'Measuring sleep regularity: theoretical properties and practical usage of existing metrics',
    journal: 'Sleep 2021;44(10):zsab103', doi: '10.1093/sleep/zsab103', pmid: '33864369',
    url: 'https://research.monash.edu/en/publications/measuring-sleep-regularity-theoretical-properties-and-practical-u/',
    population: '—', design: 'studio teorico con simulazioni',
    finding: "La deviazione standard degli orari richiede più di una settimana di dati per non essere distorta; non coglie la frammentazione del sonno; il social jetlag coglie le differenze settimanali, non quelle da un giorno all'altro.",
    limits: 'Verificato sull\'abstract.',
  },
  {
    id: 'wittmann2006', short: 'Wittmann et al. 2006', status: 'V1', verifiedOn: '2026-11-10', kind: 'method', pediatric: false,
    authors: 'Wittmann M, Dinich J, Merrow M, Roenneberg T',
    title: 'Social jetlag: misalignment of biological and social time',
    journal: 'Chronobiology International 2006;23(1–2):497–509', doi: null, pmid: '16687322',
    url: 'https://read.qxmd.com/read/16687322/social-jetlag-misalignment-of-biological-and-social-time',
    population: '—', design: 'articolo concettuale ed empirico',
    finding: "Definisce il social jetlag come la differenza tra gli orari del sonno nei giorni lavorativi e in quelli liberi.",
    limits: "Verificato il concetto. La formula del punto medio del sonno usata dall'app non compare nell'abstract letto: verifica in corso.",
  },
  {
    id: 'phillips2017', short: 'Phillips et al. 2017', status: 'V1', verifiedOn: '2026-11-10', kind: 'method', pediatric: false,
    authors: 'Phillips AJK, Clerx WM, O\'Brien CS, et al.',
    title: 'Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing',
    journal: 'Scientific Reports 2017;7:3216', doi: '10.1038/s41598-017-03171-4', pmid: '28607474',
    url: 'https://www.nature.com/articles/s41598-017-03171-4.pdf',
    population: '61 studenti, circa 30 giorni', design: 'diario del sonno online',
    finding: "Definisce l'indice di regolarità del sonno (SRI), calcolabile da un diario.",
    limits: "L'app non usa l'SRI: questa fonte non giustifica la deviazione standard circolare.",
  },
  {
    id: 'duraccio2021', short: 'Duraccio et al. 2021', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'Duraccio KM, Zaugg KK, Blackburn RC, Jensen CD',
    title: 'Does iPhone night shift mitigate negative effects of smartphone use on sleep outcomes in emerging adults?',
    journal: 'Sleep Health 2021;7(4):478–484', doi: '10.1016/j.sleh.2021.03.005', pmid: '33867308',
    url: 'https://pubmed.ncbi.nlm.nih.gov/33867308/',
    population: '167 persone di 18–24 anni', design: 'studio randomizzato a 3 gruppi, 7 notti, actigrafia',
    finding: 'Nessuna differenza tra i gruppi con e senza Night Shift.',
    limits: "Giovani adulti. L'app non fa affermazioni sulla luce dello schermo.",
  },
  {
    id: 'brown2022', short: 'Brown et al. 2022', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'Brown TM, Brainard GC, Cajochen C, Czeisler CA, Hanifin JP, Lockley SW, et al.',
    title: 'Recommendations for daytime, evening, and nighttime indoor light exposure…',
    journal: 'PLoS Biology 2022;20(3):e3001571', doi: '10.1371/journal.pbio.3001571', pmid: '35298459',
    url: 'https://journals.plos.org/plosbiology/article?id=10.1371%2Fjournal.pbio.3001571',
    population: 'adulti sani di 18–55 anni con orari diurni', design: 'raccomandazione di consenso',
    finding: 'Raccomanda luce intensa di giorno e luce bassa la sera e durante il sonno.',
    limits: "È una raccomandazione, non uno studio. L'app non stima una \"dose\" di luce.",
  },
  {
    id: 'rod2018', short: 'Rod et al. 2018', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'Rod NH, Dissing AS, Clark A, Gerds TA, Lund R',
    title: 'Overnight smartphone use: A new public health challenge?',
    journal: 'PLoS ONE 2018;13(10):e0204811', doi: '10.1371/journal.pone.0204811', pmid: null,
    url: 'https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0204811',
    population: '815 studenti universitari (77% uomini)', design: 'registri del telefono per 4 settimane, trasversale',
    finding: "Il 41% aveva avuto almeno una notte feriale interrotta dal telefono.",
    limits: 'Solo chiamate, SMS e Facebook; sonno autoriferito; partecipazione del 29%.',
  },
  {
    id: 'brautsch2023', short: 'Brautsch et al. 2023', status: 'V1', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: 'Brautsch LAS, Lund L, Andersen MM, Jennum PJ, Folker AP, Andersen S',
    title: 'Digital media use and sleep in late adolescence and young adulthood: A systematic review',
    journal: 'Sleep Medicine Reviews 2023;68:101742', doi: '10.1016/j.smrv.2022.101742', pmid: '36638702',
    url: 'https://researchprofiles.ku.dk/da/publications/digital-media-use-and-sleep-in-late-adolescence-and-young-adultho/',
    population: '42 studi osservazionali, 16–25 anni', design: 'revisione sistematica',
    finding: "Telefono, computer, internet e social si associavano a un sonno più breve e peggiore; l'uso notturno del telefono a un coricamento più tardivo.",
    limits: 'Solo studi osservazionali; giovani.',
  },
  // ----- V2: identità confermata, contenuto non riletto: mai numeri -----
  { id: 'exelmans2016', short: 'Exelmans e Van den Bulck 2016', status: 'V2', verifiedOn: '2026-11-11', kind: 'phenomenon', pediatric: false,
    authors: 'Exelmans L, Van den Bulck J', title: 'Bedtime mobile phone use and sleep in adults', journal: 'Social Science & Medicine 2016;148:93–101', doi: '10.1016/j.socscimed.2015.11.037', pmid: '26688552', url: 'https://econpapers.repec.org/RePEc:eee:socmed:v:148:y:2016:i:c:p:93-101',
    population: 'adulti', design: 'studio trasversale', qualitative: "Studio sull'uso del telefono a letto negli adulti. Contenuto: verifica in corso." },
  { id: 'chang2015', short: 'Chang et al. 2015', status: 'V2', verifiedOn: '2026-11-11', kind: 'phenomenon', pediatric: false,
    authors: 'Chang AM, Aeschbach D, Duffy JF, Czeisler CA', title: 'Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness', journal: 'PNAS 2015;112(4):1232–1237', doi: '10.1073/pnas.1418490112', pmid: '25535358', url: 'https://pubmed.ncbi.nlm.nih.gov/25535358/',
    population: 'giovani adulti', design: 'studio in laboratorio', qualitative: 'Studio di laboratorio sulla lettura serale da dispositivi luminosi. Contenuto: verifica in corso.' },
  { id: 'chinoy2018', short: 'Chinoy et al. 2018', status: 'V2', verifiedOn: '2026-11-11', kind: 'phenomenon', pediatric: false,
    authors: 'Chinoy ED, Duffy JF, Czeisler CA', title: 'Unrestricted evening use of light-emitting tablet computers delays self-selected bedtime…', journal: 'Physiological Reports 2018;6(10):e13692', doi: '10.14814/phy2.13692', pmid: '29845764', url: 'https://pubmed.ncbi.nlm.nih.gov/29845764/',
    population: 'adulti', design: 'studio in laboratorio con coricamento libero', qualitative: "Studio sull'uso serale libero di tablet e l'orario scelto per dormire. Contenuto: verifica in corso." },
  { id: 'rangtell2016', short: 'Rångtell et al. 2016', status: 'V2', verifiedOn: '2026-11-11', kind: 'phenomenon', pediatric: false,
    authors: 'Rångtell FH, et al.', title: 'Two hours of evening reading on a self-luminous tablet vs. reading a physical book does not alter sleep after daytime bright light exposure', journal: 'Sleep Medicine 2016', doi: null, pmid: '27539026', url: 'https://pubmed.ncbi.nlm.nih.gov/27539026/',
    population: 'giovani adulti', design: 'studio in laboratorio', qualitative: 'Confronto tra lettura serale da tablet e da libro. Contenuto: verifica in corso.' },
  { id: 'phillips2019', short: 'Phillips et al. 2019', status: 'V2', verifiedOn: '2026-11-11', kind: 'phenomenon', pediatric: false,
    authors: 'Phillips AJK, et al.', title: 'High sensitivity and interindividual variability in the response of the human circadian system to evening light', journal: 'PNAS 2019', doi: '10.1073/pnas.1901824116', pmid: '31138694', url: 'https://pubmed.ncbi.nlm.nih.gov/31138694/',
    population: 'adulti', design: 'studio in laboratorio', qualitative: 'Studio sulla variabilità tra persone nella risposta alla luce serale. Contenuto: verifica in corso.' },
  { id: 'hartstein2024', short: 'Hartstein et al. 2024', status: 'V2', verifiedOn: '2026-11-11', kind: 'phenomenon', pediatric: false,
    authors: 'Hartstein LE, et al.', title: 'The impact of screen use on sleep health across the lifespan: A National Sleep Foundation consensus statement', journal: 'Sleep Health 2024', doi: null, pmid: '38806392', url: 'https://www.sleephealthjournal.org/article/S2352-7218(24)00090-1/fulltext',
    population: 'consenso di esperti', design: 'dichiarazione di consenso', qualitative: 'Dichiarazione di consenso su schermi e sonno. Contenuto: verifica in corso.' },
  { id: 'singh2023', short: 'Singh et al. 2023 (Cochrane)', status: 'V2', verifiedOn: '2026-11-11', kind: 'phenomenon', pediatric: false,
    authors: 'Singh S, et al.', title: 'Blue-light filtering spectacle lenses for visual performance, sleep, and macular health in adults', journal: 'Cochrane Database of Systematic Reviews 2023', doi: '10.1002/14651858.CD013244.pub2', pmid: null, url: 'https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD013244.pub2/full',
    population: 'adulti', design: 'revisione Cochrane', qualitative: 'Revisione sulle lenti che filtrano la luce blu (non sugli schermi). Contenuto: verifica in corso.' },
  { id: 'drake2013', short: 'Drake et al. 2013', status: 'V2', verifiedOn: '2026-11-11', kind: 'phenomenon', pediatric: false,
    authors: 'Drake C, Roehrs T, Shambroom J, Roth T', title: 'Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed', journal: 'Journal of Clinical Sleep Medicine 2013', doi: '10.5664/jcsm.3170', pmid: '24235903', url: 'https://pubmed.ncbi.nlm.nih.gov/24235903/',
    population: 'adulti', design: 'studio sperimentale', qualitative: "Studio sulla caffeina assunta in diversi momenti prima di dormire; motiva in modo qualitativo l'indicatore \"caffeina tardiva\". Contenuto: verifica in corso." },
  { id: 'carney2012', short: 'Carney et al. 2012', status: 'V2', verifiedOn: '2026-11-11', kind: 'measurement', pediatric: false,
    authors: 'Carney CE, et al.', title: 'The Consensus Sleep Diary: Standardizing Prospective Sleep Self-Monitoring', journal: 'Sleep 2012;35(2):287–302', doi: '10.5665/sleep.1642', pmid: null, url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3250369/',
    population: '—', design: 'diario del sonno standardizzato', qualitative: "Struttura di un diario del sonno standard (coricamento, tentativo di dormire, addormentamento, risvegli, risveglio finale, qualità). Formulazione esatta: verifica in corso." },
  { id: 'pyper1998', short: 'Pyper e Peterman 1998', status: 'V2', verifiedOn: '2026-11-11', kind: 'method', pediatric: false,
    authors: 'Pyper BJ, Peterman RM', title: 'Comparison of methods to account for autocorrelation in correlation analyses of fish data', journal: 'Canadian Journal of Fisheries and Aquatic Sciences 1998', doi: null, pmid: null, url: null,
    population: '—', design: 'metodo statistico', qualitative: 'Correzione della numerosità effettiva quando le osservazioni vicine si somigliano (autocorrelazione). Contenuto: verifica in corso.' },
  { id: 'bh1995', short: 'Benjamini e Hochberg 1995', status: 'V2', verifiedOn: '2026-11-11', kind: 'method', pediatric: false,
    authors: 'Benjamini Y, Hochberg Y', title: 'Controlling the false discovery rate', journal: 'Journal of the Royal Statistical Society B 1995;57:289–300', doi: null, pmid: null, url: null,
    population: '—', design: 'metodo statistico (classico)', qualitative: 'Procedura per tenere sotto controllo i falsi risultati quando si fanno più confronti insieme. Riferimento classico, non riletto.' },
  { id: 'curran2011', short: 'Curran e Bauer 2011', status: 'V2', verifiedOn: '2026-11-11', kind: 'method', pediatric: false,
    authors: 'Curran PJ, Bauer DJ', title: 'The disaggregation of within-person and between-person effects in longitudinal models of change', journal: 'Annual Review of Psychology 2011;62:583–619', doi: '10.1146/annurev.psych.093008.100356', pmid: null, url: null,
    population: '—', design: 'metodo statistico', qualitative: "Principio di separare i cambiamenti lenti da quelli da una notte all'altra. Pensato per gruppi di persone, non per una persona sola. Contenuto: verifica in corso." },
  { id: 'leys2013', short: 'Leys et al. 2013', status: 'V2', verifiedOn: '2026-11-11', kind: 'method', pediatric: false,
    authors: 'Leys C, Ley C, Klein O, Bernard P, Licata L', title: 'Detecting outliers: Do not use standard deviation around the mean, use absolute deviation around the median', journal: 'Journal of Experimental Social Psychology 2013', doi: null, pmid: null, url: null,
    population: '—', design: 'metodo statistico', qualitative: "Uso della deviazione assoluta dalla mediana per riconoscere valori anomali. Non usata dall'app in questa versione." },
  { id: 'kravitz2014', short: 'Kravitz e Duan 2014', status: 'V2', verifiedOn: '2026-11-11', kind: 'method', pediatric: false,
    authors: 'Kravitz RL, Duan N, eds.', title: 'Design and Implementation of N-of-1 Trials: A User\'s Guide', journal: 'AHRQ 2014', doi: null, pmid: null, url: null,
    population: '—', design: 'guida metodologica', qualitative: "Come progettare esperimenti su una sola persona. L'app non fa esperimenti (rinviati)." },
  // ----- ESCLUSE come prova per adulti e NON VERIFICATE: mai a sostegno -----
  { id: 'tkaczyk2026', short: 'Tkaczyk et al. 2026', status: 'ESCLUSO', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: true,
    authors: 'Tkaczyk M, Ksinan AJ, Smahel D', title: 'Longitudinal Between- and Within-Person Associations Among Screen Time, Bedtime, and Daytime Sleepiness Among Adolescents', journal: 'Journal of Medical Internet Research 2026;28:e78972', doi: '10.2196/78972', pmid: '41564432', url: 'https://www.jmir.org/2026/1/e78972',
    population: 'ragazzi di 11–16 anni', design: 'tre rilevazioni a sei mesi di distanza', qualitative: "Contesto: il legame va in entrambe le direzioni, e più dall'orario di coricamento allo schermo che viceversa. Ragazzi, non adulti." },
  { id: 'heath2014', short: 'Heath et al. 2014', status: 'ESCLUSO', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: true,
    authors: 'Heath M, et al.', title: 'Tablet screenlight in adolescents', journal: 'Chronobiology International 2014', doi: null, pmid: '24397302', url: null,
    population: 'adolescenti', design: '—', qualitative: 'Studio su adolescenti: non usato.' },
  { id: 'pediatric-reviews', short: 'Hale e Guan 2015; Cain e Gradisar 2010', status: 'ESCLUSO', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: true,
    authors: 'Hale, Guan; Cain, Gradisar', title: 'Revisioni su schermi e sonno in bambini e adolescenti', journal: '—', doi: null, pmid: null, url: null,
    population: 'bambini e adolescenti', design: 'revisioni', qualitative: 'Riguardano bambini e adolescenti: non usate.' },
  { id: 'medrxiv2026', short: 'Preprint medRxiv 2026', status: 'ESCLUSO', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: '—', title: 'Preprint su un ampio insieme di notti', journal: 'medRxiv (non revisionato)', doi: null, pmid: null, url: null,
    population: '—', design: 'preprint', qualitative: 'Non revisionato da altri ricercatori: non usato.' },
  { id: 'pillion2022', short: 'Pillion 2022', status: 'ESCLUSO', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: true,
    authors: '—', title: 'Revisione su adolescenti', journal: '—', doi: null, pmid: null, url: null,
    population: 'adolescenti', design: 'revisione', qualitative: 'Riguarda adolescenti, non adulti: non usata.' },
  { id: 'bothe', short: '"Bothe et al." (J Sleep Res)', status: 'NV', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: '—', title: 'Identità non confermata', journal: '—', doi: null, pmid: null, url: null,
    population: '—', design: '—', qualitative: 'Identificativo non risolto, autori non verificati: non usata.' },
  { id: 'nv-others', short: 'Ebrahim 2013; Kredlow 2015; Gooley 2011; Buysse 2014; Borbély 1982; Watson 2015', status: 'NV', verifiedOn: '2026-11-10', kind: 'phenomenon', pediatric: false,
    authors: '—', title: 'Fonti proposte in precedenza e non verificate', journal: '—', doi: null, pmid: null, url: null,
    population: '—', design: '—', qualitative: 'Non verificate: non usate finché non lo saranno.' },
  // ----- Verifica dell'app (non letteratura) -----
  { id: 'app-simulations', short: "Simulazioni dell'app", status: 'APP', verifiedOn: '2026-11-18', kind: 'method', pediatric: false,
    authors: '—', title: 'Simulazioni del metodo su diari sintetici', journal: 'docs/research/STATISTICAL_VALIDATION.md §7 e §17; tests/unit/inference.test.mjs', doi: null, pmid: null, url: null,
    population: 'diari sintetici di 120 notti', design: 'simulazione',
    finding: "Senza alcun effetto reale, il metodo usato dall'app trova differenze \"chiare\" all'incirca con la frequenza attesa per caso (intorno al 5%), mentre un confronto ingenuo tra le notti ne trova molte di più quando le notti vicine si somigliano. Definire l'esposizione rispetto al tentativo della stessa notte produrrebbe differenze quasi sempre, per costruzione.",
    limits: 'Mostra come si comporta il metodo, non dice nulla sul sonno di nessuno.' },
];

// Collegamenti per ogni analisi (SCIENTIFIC_AUDIT §7, FINAL_ANALYTICS_SPEC §9).
// phenomenon: fonti sul fenomeno (V1, o V2 solo qualitative); context:
// fonti di contesto (pediatriche o escluse come prova per adulti, con
// badge); method: da dove vengono formula e procedura; measurement: limiti
// della misura.
export const LINKS = {
  P1: { phenomenon: ['zhong2025', 'exelmans2017', 'combertaldi2021', 'ellithorpe2022'], context: ['bourke2026', 'tkaczyk2026'], method: ['app-simulations', 'pyper1998', 'bh1995'], measurement: ['parry2021'] },
  P2: { phenomenon: ['combertaldi2021', 'exelmans2017', 'gradisar2013'], context: ['bourke2026'], method: ['app-simulations', 'pyper1998', 'bh1995'], measurement: ['parry2021'] },
  P3: { phenomenon: ['zhong2025', 'mcalpine2024', 'leger2024', 'ellithorpe2022'], context: ['bourke2026'], method: ['app-simulations', 'pyper1998', 'bh1995'], measurement: ['parry2021'] },
  regularity: { phenomenon: [], context: [], method: ['fischer2021', 'wittmann2006'], measurement: [] },
};

// Sintesi generale (SCIENTIFIC_AUDIT §4), solo qualitativa: nessun numero.
export const SUMMARY = [
  "Negli adulti l'associazione più coerente tra studi diversi riguarda l'orario: chi usa gli schermi prima di dormire tende ad addormentarsi più tardi. Gli effetti sulla qualità del sonno sono meno chiari.",
  "Gli studi che confrontano le notti della stessa persona trovano effetti piccoli o assenti: un diario personale non deve aspettarsi differenze grandi.",
  "Il legame può andare in entrambe le direzioni: chi ha meno sonno o va a letto più tardi può usare di più lo schermo.",
  "Gli studi di laboratorio sulla luce degli schermi non sono ancora stati riletti sulle fonti originali: l'app non fa affermazioni sulla luce.",
  "Non è dimostrato che usare lo schermo a letto sia peggio in sé: la distinzione usata dall'app è tra prima e dopo aver provato a dormire.",
];
