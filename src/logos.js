/**
 * Team-logo lookup + local cache.
 *
 * Pipeline per team:
 *   1. If dist/teams/{slug}.png already exists → done, no network.
 *   2. Look up via Wikipedia REST page summary (using TEAM_WIKI override
 *      if present, else the team's display name).
 *   3. If page summary returns a thumbnail, request a larger size from
 *      Commons (we ask for 256px wide; the URL pattern allows arbitrary
 *      widths via /thumb/.../<W>px-<file>).
 *   4. Download bytes, write to dist/teams/{slug}.png.
 *   5. Update dist/team-logos.json manifest with slug, source URL,
 *      Wikipedia title, and timestamp. Misses are also recorded with
 *      `missing: true` so we don't re-query every run.
 *
 * Polite to Wikipedia: a 750ms delay between lookups, custom UA string.
 *
 * Output: each team has ONE PNG committed in dist/teams/. The WP theme
 * serves these via jsDelivr's GitHub CDN — no runtime Wikipedia traffic.
 */

import fs    from 'node:fs/promises';
import fssync from 'node:fs';
import path  from 'node:path';
import axios from 'axios';

import { wikipediaTitle } from './teams.js';

const WIKI_API_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const WIKI_API_W    = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT    = 'FMScraper/1.0 (https://www.futbolmundial.com/bots; teams)';
const REQ_DELAY     = 750;
const TARGET_WIDTH  = 256; // px — fits the match-list rows comfortably
const MISS_RETRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sleep( ms ) {
	return new Promise( r => setTimeout( r, ms ) );
}

/**
 * Bumps a Wikipedia /thumb/<…>/<W>px-<file> URL to a target width.
 * If the URL isn't a /thumb/ URL (rare), returns the original.
 */
function bumpThumbWidth( url, width ) {
	if ( ! url ) return url;
	return url.replace( /\/(\d+)px-/, `/${ width }px-` );
}

// Indicators that a Wikipedia page is actually a football club / national
// team (vs. the homonymous city, river, mythological figure, etc.).
const CLUB_RE = /\b(football|soccer|f\.?c\.?|club|national team|f[uú]tbol|calcio|fu[sß]ball|futebol|equipe|selec[çc][ãa]o|seleccí[oó]n|associa[çc][aã]o desportiva)\b/i;

// Wikipedia thumbnails for football clubs reliably contain one of these
// substrings in the file name. Used as a secondary validation when the
// page description doesn't explicitly mention sport (rare but happens for
// stub articles).
const CREST_RE = /\b(logo|crest|badge|emblem|escudo|wappen|stemma|f\.?c\.?|football)\b/i;

/**
 * Calls the Wikipedia page-summary REST endpoint. Returns the
 * (title, thumbnail-url, description) tuple or null on miss.
 */
async function pageSummary( title ) {
	const url = `${ WIKI_API_REST }/${ encodeURIComponent( title.replace( / /g, '_' ) ) }`;
	try {
		const res = await axios.get( url, {
			timeout: 15_000,
			headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
			validateStatus: s => s < 500,
		} );
		if ( res.status >= 400 ) return null;
		const data  = res.data || {};
		const thumb = data.thumbnail?.source || data.originalimage?.source || null;
		if ( ! thumb ) return null;
		return {
			title:       data.title || title,
			description: data.description || '',
			extract:     data.extract || '',
			thumbUrl:    bumpThumbWidth( thumb, TARGET_WIDTH ),
		};
	} catch {
		return null;
	}
}

/**
 * True when this page summary looks like a football club / national team
 * article — not a city, river, mountain, etc. Two-stage check: the short
 * "description" field is most reliable; we fall back to the longer
 * "extract" and the thumbnail filename to catch the few clubs Wikipedia
 * describes as just "association football club" without "team/club" word.
 */
function isFootballPage( summary ) {
	if ( ! summary ) return false;
	if ( CLUB_RE.test( summary.description ) ) return true;
	if ( CLUB_RE.test( summary.extract ) ) return true;
	if ( CREST_RE.test( summary.thumbUrl ) ) return true;
	return false;
}

/**
 * opensearch fallback when the page-summary direct lookup misses.
 * Tries a couple of disambiguating suffixes.
 */
async function searchTitle( name ) {
	const queries = [
		`${ name } football club`,
		`${ name } F.C.`,
		`${ name } soccer`,
		name,
	];
	for ( const q of queries ) {
		try {
			const res = await axios.get( WIKI_API_W, {
				timeout: 15_000,
				headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
				params: {
					action:    'opensearch',
					search:    q,
					limit:     1,
					namespace: 0,
					format:    'json',
				},
			} );
			const arr = Array.isArray( res.data ) ? res.data : null;
			if ( arr && arr[ 1 ] && arr[ 1 ][ 0 ] ) return arr[ 1 ][ 0 ];
		} catch { /* keep trying next suffix */ }
		await sleep( 250 );
	}
	return null;
}

async function downloadImage( url, destPath ) {
	const MAX_ATTEMPTS = 4;
	let lastErr;
	for ( let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++ ) {
		try {
			const res = await axios.get( url, {
				timeout: 20_000,
				responseType: 'arraybuffer',
				headers: { 'User-Agent': USER_AGENT, 'Accept': 'image/png,image/svg+xml,*/*' },
				validateStatus: s => s === 200,
			} );
			await fs.mkdir( path.dirname( destPath ), { recursive: true } );
			await fs.writeFile( destPath, res.data );
			return;
		} catch ( err ) {
			lastErr = err;
			const status = err.response?.status;
			// Honour Retry-After if upstream sets it; otherwise exponential backoff.
			const retryAfterHdr = parseInt( err.response?.headers?.[ 'retry-after' ] || '0', 10 );
			const waitMs = retryAfterHdr > 0
				? ( retryAfterHdr * 1000 )
				: ( 1500 * attempt + Math.floor( Math.random() * 750 ) );
			if ( attempt < MAX_ATTEMPTS && ( status === 429 || status >= 500 ) ) {
				await sleep( waitMs );
				continue;
			}
			break;
		}
	}
	throw lastErr;
}

/* ---------- Manifest ---------- */

async function loadManifest( manifestPath ) {
	try {
		const raw = await fs.readFile( manifestPath, 'utf8' );
		return JSON.parse( raw );
	} catch {
		return {};
	}
}

async function saveManifest( manifestPath, manifest ) {
	const sorted = Object.fromEntries(
		Object.entries( manifest ).sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) )
	);
	await fs.writeFile( manifestPath, JSON.stringify( sorted, null, 2 ), 'utf8' );
}

/* ---------- Public ---------- */

/**
 * Resolves logos for a list of unique team objects ({ name, slug }).
 *
 * Side effects:
 *   - Writes dist/teams/{slug}.png for any team newly resolved.
 *   - Updates dist/team-logos.json manifest in place.
 *
 * Returns:
 *   {
 *     resolved:  { slug -> { name, title, file, source, fetched_at } },
 *     missing:   [ { name, slug, lastTried } ],
 *     newDownloads: number,
 *   }
 */
export async function resolveLogos( teams, opts = {} ) {
	const teamsDir     = opts.teamsDir;
	const manifestPath = opts.manifestPath;

	if ( ! teamsDir || ! manifestPath ) {
		throw new Error( 'resolveLogos: teamsDir and manifestPath are required' );
	}

	const manifest = await loadManifest( manifestPath );
	const resolved = {};
	const missing  = [];
	let   newDownloads = 0;
	const now = Date.now();

	for ( const team of teams ) {
		const { name, slug } = team;
		if ( ! slug ) continue;

		const cached  = manifest[ slug ];
		const pngPath = path.join( teamsDir, `${ slug }.png` );

		// HIT: PNG exists and not flagged missing → reuse silently.
		if ( cached && ! cached.missing && fssync.existsSync( pngPath ) ) {
			resolved[ slug ] = cached;
			continue;
		}

		// MISS recently logged → skip until MISS_RETRY_MS elapsed.
		if ( cached && cached.missing ) {
			const last = Date.parse( cached.last_tried || 0 ) || 0;
			if ( ( now - last ) < MISS_RETRY_MS ) {
				missing.push( { name, slug, lastTried: cached.last_tried } );
				continue;
			}
		}

		// Lookup pipeline:
		//   1. Wikipedia title from TEAM_WIKI override (or raw name)
		//   2. Same with " F.C." suffix
		//   3. Same with " (football club)" disambiguation
		//   4. Opensearch with disambiguating "<name> football club"
		// Each candidate is validated via isFootballPage() to reject
		// homonymous city/landmark pages (e.g. "Liverpool" the city).
		const title = wikipediaTitle( name );
		const candidates = [
			title,
			`${ title } F.C.`,
			`${ title } (football club)`,
		];
		// If the alias DIDN'T transform the name, also try a direct opensearch.
		if ( title === name ) {
			candidates.push( null ); // sentinel for "do an opensearch"
		}

		let summary = null;
		for ( const candidate of candidates ) {
			let nextTitle = candidate;
			if ( nextTitle === null ) {
				nextTitle = await searchTitle( name );
				if ( ! nextTitle ) continue;
			}
			const s = await pageSummary( nextTitle );
			await sleep( REQ_DELAY );
			if ( s && isFootballPage( s ) ) { summary = s; break; }
		}

		if ( ! summary ) {
			manifest[ slug ] = {
				name,
				missing:    true,
				last_tried: new Date().toISOString(),
			};
			missing.push( { name, slug, lastTried: manifest[ slug ].last_tried } );
			continue;
		}

		// Download (polite delay between successful downloads handled below)
		try {
			await downloadImage( summary.thumbUrl, pngPath );
			await sleep( 400 );
			newDownloads++;
			const entry = {
				name,
				title:      summary.title,
				file:       `teams/${ slug }.png`,
				source:     summary.thumbUrl,
				fetched_at: new Date().toISOString(),
			};
			manifest[ slug ] = entry;
			resolved[ slug ] = entry;
		} catch ( err ) {
			manifest[ slug ] = {
				name,
				title:      summary.title,
				missing:    true,
				last_tried: new Date().toISOString(),
				error:      String( err.message || err ),
			};
			missing.push( { name, slug, lastTried: manifest[ slug ].last_tried } );
		}
	}

	await saveManifest( manifestPath, manifest );

	return { resolved, missing, newDownloads };
}
