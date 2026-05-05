/**
 * Master list of competitions tracked by the Where to Watch tool.
 *
 * `slug`        — used in JSON output + UI filter chips. Stable. Never change.
 * `label`       — display name shown in chips & headings.
 * `region`      — top-level filter group (Domestic / International / Cup).
 * `priority`    — sort weight when chips render (lower = first).
 * `wstSlug`     — corresponding worldsoccertalk.com competition page slug.
 *                 If absent we skip the per-competition scrape.
 * `enabled`     — admins toggle this in WP. Mirrored at runtime by plugin
 *                 settings; the scraper writes ALL competitions and the
 *                 plugin filters at render time.
 */
export const COMPETITIONS = [
	// Top 5 European leagues
	{ slug: 'eng-premier',     label: 'English Premier League', region: 'Europe',        priority: 10, wstSlug: 'english-premier-league' },
	{ slug: 'esp-laliga',      label: 'La Liga',                 region: 'Europe',        priority: 11, wstSlug: 'la-liga' },
	{ slug: 'ger-bundesliga',  label: 'Bundesliga',              region: 'Europe',        priority: 12, wstSlug: 'bundesliga' },
	{ slug: 'ita-seriea',      label: 'Serie A',                 region: 'Europe',        priority: 13, wstSlug: 'serie-a' },
	{ slug: 'fra-ligue1',      label: 'Ligue 1',                 region: 'Europe',        priority: 14, wstSlug: 'ligue-1' },

	// Other Euro
	{ slug: 'por-primeira',    label: 'Primeira Liga',           region: 'Europe',        priority: 20, wstSlug: 'primeira-liga' },
	{ slug: 'bel-pro',         label: 'Belgian Pro League',      region: 'Europe',        priority: 21, wstSlug: 'belgian-pro-league' },
	{ slug: 'eng-champ',       label: 'English Championship',    region: 'Europe',        priority: 22, wstSlug: 'english-football-league-championship' },

	// UEFA club
	{ slug: 'uefa-ucl',        label: 'UEFA Champions League',   region: 'UEFA',          priority: 30, wstSlug: 'champions-league' },
	{ slug: 'uefa-uel',        label: 'UEFA Europa League',      region: 'UEFA',          priority: 31, wstSlug: 'europa-league' },
	{ slug: 'uefa-uecl',       label: 'UEFA Conference League',  region: 'UEFA',          priority: 32, wstSlug: 'europa-conference-league' },

	// Americas — domestic
	{ slug: 'usa-mls',         label: 'MLS',                     region: 'Americas',      priority: 40, wstSlug: 'mls' },
	{ slug: 'mex-ligamx',      label: 'Liga MX',                 region: 'Americas',      priority: 41, wstSlug: 'liga-mx' },
	{ slug: 'arg-primera',     label: 'Liga Profesional Argentina', region: 'Americas',   priority: 42, wstSlug: 'liga-profesional-argentina' },
	{ slug: 'bra-serieA',      label: 'Brasileirão Série A',     region: 'Americas',      priority: 43, wstSlug: 'brasileirao' },

	// CONCACAF / CONMEBOL club
	{ slug: 'concacaf-cc',     label: 'CONCACAF Champions Cup',  region: 'Confederations', priority: 50, wstSlug: 'concacaf-champions-cup' },
	{ slug: 'conmebol-libert', label: 'Copa Libertadores',       region: 'Confederations', priority: 51, wstSlug: 'copa-libertadores' },
	{ slug: 'conmebol-suda',   label: 'Copa Sudamericana',       region: 'Confederations', priority: 52, wstSlug: 'copa-sudamericana' },

	// National-team competitions
	{ slug: 'uefa-euros',      label: 'UEFA European Championship', region: 'National',   priority: 60, wstSlug: 'european-championship' },
	{ slug: 'concacaf-gold',   label: 'CONCACAF Gold Cup',       region: 'National',      priority: 61, wstSlug: 'gold-cup' },
	{ slug: 'conmebol-copaam', label: 'Copa América',            region: 'National',      priority: 62, wstSlug: 'copa-america' },
	{ slug: 'caf-afcon',       label: 'Africa Cup of Nations',   region: 'National',      priority: 63, wstSlug: 'africa-cup-of-nations' },
	{ slug: 'fifa-wcq',        label: 'World Cup Qualifiers',    region: 'National',      priority: 64, wstSlug: 'world-cup-qualifying' },
];

export function findCompetition( slug ) {
	return COMPETITIONS.find( c => c.slug === slug ) || null;
}
