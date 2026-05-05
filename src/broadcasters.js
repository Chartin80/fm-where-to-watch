/**
 * Canonical broadcaster catalogue. The scraper normalises every raw "channel"
 * string from worldsoccertalk.com into one of these slugs. Anything that
 * doesn't match falls into a synthetic "other" entry (still rendered, but
 * without a logo).
 *
 * `slug`     — stable identifier; theme references /assets/img/broadcasters/<slug>.svg
 * `label`    — display name on the chip
 * `match`    — regex tested case-insensitively against the raw channel string
 * `tier`     — 1 = major (always shown), 2 = secondary, 3 = streaming-only
 */
export const BROADCASTERS = [
	{ slug: 'cbs',          label: 'CBS',            tier: 1, match: /^cbs(?!\s*sports\s*network)|cbs sports$/i },
	{ slug: 'paramount',    label: 'Paramount+',     tier: 3, match: /paramount\+|paramount plus/i },
	{ slug: 'cbssn',        label: 'CBS Sports Net', tier: 2, match: /cbs sports network/i },
	{ slug: 'nbc',          label: 'NBC',            tier: 1, match: /^nbc$|nbc sports/i },
	{ slug: 'peacock',      label: 'Peacock',        tier: 3, match: /peacock/i },
	{ slug: 'usa',          label: 'USA Network',    tier: 2, match: /usa network/i },
	{ slug: 'espn',         label: 'ESPN',           tier: 1, match: /^espn(?!\+|\s*deportes|\s*2)/i },
	{ slug: 'espn-plus',    label: 'ESPN+',          tier: 3, match: /espn\+|espn plus/i },
	{ slug: 'espn-dep',     label: 'ESPN Deportes',  tier: 2, match: /espn deportes/i },
	{ slug: 'fox',          label: 'Fox',            tier: 1, match: /^fox(?!\s*(sports|soccer|deportes))$/i },
	{ slug: 'fs1',          label: 'FS1',            tier: 1, match: /\bfs1\b|fox sports 1/i },
	{ slug: 'fs2',          label: 'FS2',            tier: 2, match: /\bfs2\b|fox sports 2/i },
	{ slug: 'fox-deportes', label: 'Fox Deportes',   tier: 2, match: /fox deportes/i },
	{ slug: 'apple',        label: 'Apple TV',       tier: 3, match: /apple tv|mls season pass/i },
	{ slug: 'fubo',         label: 'Fubo',           tier: 3, match: /\bfubo\b|fubotv/i },
	{ slug: 'vix',          label: 'ViX',            tier: 3, match: /\bvix\b/i },
	{ slug: 'tudn',         label: 'TUDN',           tier: 2, match: /\btudn\b/i },
	{ slug: 'telemundo',    label: 'Telemundo',      tier: 2, match: /telemundo/i },
	{ slug: 'bein',         label: 'beIN Sports',    tier: 2, match: /bein/i },
];

/**
 * Map a raw channel string to one or more broadcaster records.
 * Real-world strings can be "USA Network, Telemundo, Peacock, Universo".
 */
export function normalizeChannels( raw ) {
	if ( ! raw ) return [];
	const parts = String( raw )
		.split( /\s*(?:[,;\/]|\sand\s)\s*/i )
		.map( s => s.trim() )
		.filter( Boolean );

	const seen   = new Set();
	const out    = [];
	for ( const p of parts ) {
		const hit = BROADCASTERS.find( b => b.match.test( p ) );
		if ( hit ) {
			if ( ! seen.has( hit.slug ) ) {
				seen.add( hit.slug );
				out.push( { slug: hit.slug, label: hit.label, tier: hit.tier } );
			}
		} else {
			const slug = 'other:' + p.toLowerCase().replace( /[^a-z0-9]+/g, '-' ).replace( /(^-|-$)/g, '' );
			if ( ! seen.has( slug ) ) {
				seen.add( slug );
				out.push( { slug, label: p, tier: 4 } );
			}
		}
	}
	return out;
}
