/**
 * Team name normalisation + Wikipedia title overrides.
 *
 * The fixture source (worldsoccertalk.com) emits free-form team strings.
 * To attach a logo we need a stable slug per club AND a way to resolve to
 * a canonical Wikipedia article (where most teams have a crest in the
 * page-summary thumbnail).
 *
 * Two layers:
 *   1. slugify() — deterministic URL-safe slug from any team string,
 *      stripping accents and leading list numbers.
 *   2. wikipediaTitle() — returns an explicit Wikipedia article title
 *      for known ambiguous cases (e.g. "Corinthians" → SC Corinthians
 *      Paulista, not the historical 1882 amateur club).
 *
 * For everything not in TEAM_WIKI, the lookup pipeline falls back to
 * a plain "<name>" page lookup, then opensearch. The cache file
 * dist/team-logos.json grows over time.
 */

/* ---------- slugify ---------- */

const ACCENT_RE = /[\u0300-\u036f]/g;

export function slugify( name ) {
	return String( name || '' )
		.normalize( 'NFD' ).replace( ACCENT_RE, '' )
		// Drop a leading "1. " / "2. " ordinal that WST sometimes emits
		// (e.g. "1. FC Heidenheim 1846").
		.replace( /^\s*\d+\.\s+/, '' )
		.toLowerCase()
		.replace( /&/g, ' and ' )
		.replace( /[^a-z0-9]+/g, '-' )
		.replace( /^-+|-+$/g, '' );
}

/* ---------- Wikipedia title overrides ----------
 * Only list teams where the simple "<name>" page-lookup either returns
 * the wrong page (disambiguation, mythological term, generic word) or
 * returns a page with no crest thumbnail. The pipeline tries the team
 * name FIRST and only falls back to these for misses.
 */
export const TEAM_WIKI = {
	// MLS / North America
	'Inter Miami':                'Inter Miami CF',
	'LAFC':                       'Los Angeles FC',
	'LA Galaxy':                  'LA Galaxy',
	'NYCFC':                      'New York City FC',
	'NY Red Bulls':               'New York Red Bulls',
	'New York Red Bulls':         'New York Red Bulls',
	'St. Louis City SC':          'St. Louis City SC',
	'Sporting KC':                'Sporting Kansas City',
	'Vancouver Whitecaps':        'Vancouver Whitecaps FC',
	'Toronto FC':                 'Toronto FC',
	'Atlanta United':             'Atlanta United FC',

	// Liga MX
	'América':                    'Club América',
	'Club América':               'Club América',
	'Atlas':                      'Atlas F.C.',
	'Tigres':                     'Tigres UANL',
	'Cruz Azul':                  'Cruz Azul',
	'Pachuca':                    'C.F. Pachuca',
	'Toluca':                     'Deportivo Toluca F.C.',
	'León':                       'Club León',
	'Guadalajara':                'C.D. Guadalajara',
	'Chivas':                     'C.D. Guadalajara',
	'Necaxa':                     'Club Necaxa',
	'Puebla':                     'Club Puebla',
	'Monterrey':                  'C.F. Monterrey',
	'Querétaro':                  'Querétaro F.C.',
	'Mazatlán':                   'Mazatlán F.C.',
	'Juárez':                     'F.C. Juárez',
	'Tijuana':                    'Club Tijuana',
	'Santos Laguna':              'Santos Laguna',

	// CONMEBOL clubs
	'Boca Juniors':               'Boca Juniors',
	'River Plate':                'Club Atlético River Plate',
	'Corinthians':                'Sport Club Corinthians Paulista',
	'Palmeiras':                  'Sociedade Esportiva Palmeiras',
	'São Paulo':                  'São Paulo FC',
	'Flamengo':                   'Clube de Regatas do Flamengo',
	'Fluminense':                 'Fluminense FC',
	'Vasco':                      'CR Vasco da Gama',
	'Vasco da Gama':              'CR Vasco da Gama',
	'Atlético Mineiro':           'Clube Atlético Mineiro',
	'Atlético-MG':                'Clube Atlético Mineiro',
	'Botafogo':                   'Botafogo de Futebol e Regatas',
	'Internacional':              'Sport Club Internacional',
	'Grêmio':                     'Grêmio Foot-Ball Porto Alegrense',
	'Cruzeiro':                   'Cruzeiro Esporte Clube',
	'Santos':                     'Santos FC',
	'Independiente':              'Club Atlético Independiente',
	'Racing':                     'Racing Club de Avellaneda',
	'Estudiantes':                'Estudiantes de La Plata',
	'Vélez':                      'Club Atlético Vélez Sarsfield',
	'Vélez Sarsfield':            'Club Atlético Vélez Sarsfield',
	'San Lorenzo':                'San Lorenzo de Almagro',
	'Lanús':                      'Club Atlético Lanús',
	'Talleres':                   'Talleres de Córdoba',
	'Banfield':                   'Club Atlético Banfield',
	'Newells':                    "Newell's Old Boys",
	"Newell's":                   "Newell's Old Boys",
	'Rosario Central':            'Rosario Central',
	'Argentinos Juniors':         'Argentinos Juniors',
	'Always Ready':               'Club Always Ready',
	'Bolívar':                    'Club Bolívar',
	'The Strongest':              'Club The Strongest',
	'Universidad Católica':       'Club Deportivo Universidad Católica',
	'Universidad de Chile':       'Universidad de Chile',
	'Colo-Colo':                  'Colo-Colo',
	'Colo Colo':                  'Colo-Colo',
	'Olimpia':                    'Club Olimpia',
	'Cerro Porteño':              'Club Cerro Porteño',
	'Libertad':                   'Club Libertad',
	'Nacional':                   'Club Nacional de Football',
	'Peñarol':                    'Club Atlético Peñarol',
	'Defensor':                   'Defensor Sporting',
	'Defensor Sporting':          'Defensor Sporting',
	'Liga de Quito':              'L.D.U. Quito',
	'LDU Quito':                  'L.D.U. Quito',
	'Barcelona SC':               'Barcelona S.C.',
	'Emelec':                     'C.S. Emelec',
	'Independiente del Valle':    'Independiente del Valle',
	'Independiente Petrolero':    'Independiente Petrolero',
	'Sporting Cristal':           'Sporting Cristal',
	'Universitario':              'Universitario de Deportes',
	'Alianza Lima':               'Alianza Lima',
	'Caracas':                    'Caracas FC',
	'Junior':                     'Junior FC',
	'Atlético Nacional':          'Atlético Nacional',
	'Millonarios':                'Millonarios FC',
	'Deportivo Cali':             'Deportivo Cali',
	'América de Cali':            'América de Cali',

	// EPL — most resolve cleanly, just add a few that don't
	'Bournemouth':                'AFC Bournemouth',
	'Brighton':                   'Brighton & Hove Albion F.C.',
	'Brighton and Hove Albion':   'Brighton & Hove Albion F.C.',
	'Forest':                     'Nottingham Forest F.C.',
	'Nottingham Forest':          'Nottingham Forest F.C.',
	'Manchester United':          'Manchester United F.C.',
	'Man Utd':                    'Manchester United F.C.',
	'Manchester City':            'Manchester City F.C.',
	'Man City':                   'Manchester City F.C.',
	'Newcastle':                  'Newcastle United F.C.',
	'Newcastle United':           'Newcastle United F.C.',
	'Tottenham':                  'Tottenham Hotspur F.C.',
	'Spurs':                      'Tottenham Hotspur F.C.',
	'West Ham':                   'West Ham United F.C.',
	'West Ham United':            'West Ham United F.C.',
	'Wolves':                     'Wolverhampton Wanderers F.C.',
	'Wolverhampton':              'Wolverhampton Wanderers F.C.',
	'Crystal Palace':              'Crystal Palace F.C.',
	'Liverpool':                   'Liverpool F.C.',
	'Arsenal':                     'Arsenal F.C.',
	'Chelsea':                     'Chelsea F.C.',
	'Everton':                     'Everton F.C.',
	'Aston Villa':                 'Aston Villa F.C.',
	'Brentford':                   'Brentford F.C.',
	'Burnley':                     'Burnley F.C.',
	'Fulham':                      'Fulham F.C.',
	'Southampton':                 'Southampton F.C.',
	'Sunderland':                  'Sunderland A.F.C.',
	'Middlesbrough':               'Middlesbrough F.C.',
	'Millwall':                    'Millwall F.C.',
	'Hull City':                   'Hull City A.F.C.',
	'Leeds United':                'Leeds United F.C.',
	'Leicester':                   'Leicester City F.C.',
	'Leicester City':              'Leicester City F.C.',
	'Sheffield United':            'Sheffield United F.C.',
	'Sheffield Wednesday':         'Sheffield Wednesday F.C.',
	'Birmingham City':             'Birmingham City F.C.',
	'Norwich City':                'Norwich City F.C.',
	'Watford':                     'Watford F.C.',
	'Stoke City':                  'Stoke City F.C.',
	'Preston':                     'Preston North End F.C.',
	'Preston North End':           'Preston North End F.C.',
	'QPR':                         'Queens Park Rangers F.C.',
	'Queens Park Rangers':         'Queens Park Rangers F.C.',
	'Bristol City':                'Bristol City F.C.',
	'Cardiff City':                'Cardiff City F.C.',
	'Swansea':                     'Swansea City A.F.C.',
	'Swansea City':                'Swansea City A.F.C.',
	'Coventry':                    'Coventry City F.C.',
	'Coventry City':               'Coventry City F.C.',
	'West Bromwich':               'West Bromwich Albion F.C.',
	'West Brom':                   'West Bromwich Albion F.C.',
	'Plymouth':                    'Plymouth Argyle F.C.',
	'Plymouth Argyle':             'Plymouth Argyle F.C.',
	'Oxford United':               'Oxford United F.C.',
	'Luton':                       'Luton Town F.C.',
	'Luton Town':                  'Luton Town F.C.',
	'Blackburn':                   'Blackburn Rovers F.C.',
	'Blackburn Rovers':            'Blackburn Rovers F.C.',
	'Wrexham':                     'Wrexham A.F.C.',
	'Charlton':                    'Charlton Athletic F.C.',
	'Charlton Athletic':           'Charlton Athletic F.C.',
	'Ipswich':                     'Ipswich Town F.C.',
	'Ipswich Town':                'Ipswich Town F.C.',
	'Derby County':                'Derby County F.C.',
	'Portsmouth':                  'Portsmouth F.C.',

	// Argentine "Racing"  — the Avellaneda club, not the Curaçao one.
	'Racing Club':                 'Racing Club de Avellaneda',

	// Misc latin-America from the misses list
	'Macará':                      'Macará',
	'Mirassol':                    'Mirassol Futebol Clube',
	'Universidad Central':         'CD Universidad Central',
	'Puerto Cabello':              'Academia Puerto Cabello',
	'Strasbourg':                  'RC Strasbourg Alsace',
	'Montréal':                    'CF Montréal',
	'Montreal':                    'CF Montréal',
	'CF Montréal':                 'CF Montréal',
	'Platense':                    'Club Atlético Platense',
	'Universidad Central':         'Universidad Central de Venezuela F.C.',
	'CD Universidad Católica (Chile)': 'Club Deportivo Universidad Católica',
	'Universidad Católica':        'Club Deportivo Universidad Católica',

	// La Liga
	'Atlético Madrid':            'Atlético Madrid',
	'Atletico Madrid':            'Atlético Madrid',
	'Athletic Bilbao':            'Athletic Bilbao',
	'Real Sociedad':              'Real Sociedad',
	'Real Madrid':                'Real Madrid CF',
	'Barcelona':                  'FC Barcelona',
	'Real Betis':                 'Real Betis',
	'Sevilla':                    'Sevilla FC',
	'Valencia':                   'Valencia CF',
	'Villarreal':                 'Villarreal CF',
	'Celta':                      'RC Celta de Vigo',
	'Celta Vigo':                 'RC Celta de Vigo',
	'Espanyol':                   'RCD Espanyol',
	'Mallorca':                   'RCD Mallorca',
	'Girona':                     'Girona FC',
	'Getafe':                     'Getafe CF',
	'Osasuna':                    'CA Osasuna',
	'Rayo Vallecano':             'Rayo Vallecano',
	'Alavés':                     'Deportivo Alavés',
	'Levante':                    'Levante UD',
	'Elche':                      'Elche CF',
	'Las Palmas':                 'UD Las Palmas',
	'Real Oviedo':                'Real Oviedo',
	'Oviedo':                     'Real Oviedo',

	// Bundesliga
	'Bayern Munich':              'FC Bayern Munich',
	'Bayern':                     'FC Bayern Munich',
	'Borussia Dortmund':          'Borussia Dortmund',
	'Dortmund':                   'Borussia Dortmund',
	'Borussia Mönchengladbach':   'Borussia Mönchengladbach',
	'Bayer Leverkusen':           'Bayer 04 Leverkusen',
	'Leverkusen':                 'Bayer 04 Leverkusen',
	'RB Leipzig':                 'RB Leipzig',
	'Leipzig':                    'RB Leipzig',
	'Eintracht Frankfurt':        'Eintracht Frankfurt',
	'Frankfurt':                  'Eintracht Frankfurt',
	'Hoffenheim':                 'TSG 1899 Hoffenheim',
	'Wolfsburg':                  'VfL Wolfsburg',
	'Werder Bremen':              'SV Werder Bremen',
	'Stuttgart':                  'VfB Stuttgart',
	'Mainz':                      '1. FSV Mainz 05',
	'Augsburg':                   'FC Augsburg',
	'Freiburg':                   'SC Freiburg',
	'Union Berlin':               '1. FC Union Berlin',
	'St. Pauli':                  'FC St. Pauli',
	'Heidenheim':                 '1. FC Heidenheim',
	'FC Heidenheim 1846':         '1. FC Heidenheim',
	'Hamburg':                    'Hamburger SV',
	'Hamburger SV':               'Hamburger SV',
	'Köln':                       '1. FC Köln',
	'1. FC Köln':                 '1. FC Köln',

	// Serie A
	'Inter':                      'Inter Milan',
	'Inter Milan':                'Inter Milan',
	'Internazionale':             'Inter Milan',
	'AC Milan':                   'A.C. Milan',
	'Milan':                      'A.C. Milan',
	'Juventus':                   'Juventus FC',
	'Roma':                       'A.S. Roma',
	'AS Roma':                    'A.S. Roma',
	'Napoli':                     'S.S.C. Napoli',
	'Lazio':                      'S.S. Lazio',
	'Atalanta':                   'Atalanta B.C.',
	'Fiorentina':                 'ACF Fiorentina',
	'Torino':                     'Torino F.C.',
	'Bologna':                    'Bologna F.C. 1909',
	'Udinese':                    'Udinese Calcio',
	'Sassuolo':                   'U.S. Sassuolo Calcio',
	'Genoa':                      'Genoa CFC',
	'Lecce':                      'U.S. Lecce',
	'Cagliari':                   'Cagliari Calcio',
	'Hellas Verona':              'Hellas Verona F.C.',
	'Verona':                     'Hellas Verona F.C.',
	'Empoli':                     'Empoli FC',
	'Como':                       'Como 1907',
	'Monza':                      'A.C. Monza',
	'Cremonese':                  'U.S. Cremonese',
	'Pisa':                       'A.C. Pisa 1909',
	'Parma':                      'Parma Calcio 1913',
	'Venezia':                    'Venezia FC',

	// Portugal / Belgium
	'Benfica':                    'S.L. Benfica',
	'Porto':                      'FC Porto',
	'Sporting':                   'Sporting CP',
	'Sporting CP':                'Sporting CP',
	'Braga':                      'S.C. Braga',
	'Anderlecht':                 'R.S.C. Anderlecht',
	'Club Brugge':                'Club Brugge KV',
	'Genk':                       'K.R.C. Genk',
	'Standard Liège':             'Standard Liège',

	// Common national teams (CONMEBOL/UEFA/CONCACAF)
	'Argentina':                  'Argentina national football team',
	'Brazil':                     'Brazil national football team',
	'Uruguay':                    'Uruguay national football team',
	'Colombia':                   'Colombia national football team',
	'Chile':                      'Chile national football team',
	'Peru':                       'Peru national football team',
	'Ecuador':                    'Ecuador national football team',
	'Bolivia':                    'Bolivia national football team',
	'Paraguay':                   'Paraguay national football team',
	'Venezuela':                  'Venezuela national football team',
	'Mexico':                     'Mexico national football team',
	'United States':              'United States national soccer team',
	'USA':                        'United States national soccer team',
	'Canada':                     'Canada men\'s national soccer team',
	'England':                    'England national football team',
	'France':                     'France national football team',
	'Germany':                    'Germany national football team',
	'Spain':                      'Spain national football team',
	'Italy':                      'Italy national football team',
	'Portugal':                   'Portugal national football team',
	'Netherlands':                'Netherlands national football team',
	'Belgium':                    'Belgium national football team',
};

/**
 * Returns the Wikipedia article title to query for a given team name.
 * Falls back to the original name if no override exists; the lookup
 * pipeline will then try a direct page lookup + opensearch as needed.
 */
export function wikipediaTitle( name ) {
	if ( ! name ) return '';
	const trimmed = name.trim();
	if ( TEAM_WIKI[ trimmed ] ) return TEAM_WIKI[ trimmed ];
	// Strip leading "1. " ordinal so "1. FC Heidenheim 1846" matches "FC Heidenheim 1846"
	const noOrd = trimmed.replace( /^\s*\d+\.\s+/, '' );
	if ( TEAM_WIKI[ noOrd ] ) return TEAM_WIKI[ noOrd ];
	return trimmed;
}
