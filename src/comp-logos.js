/**
 * Competition-logo lookup + local cache.
 *
 * Mirrors the team-logos resolver but with a hand-curated Wikipedia title
 * map (competition list is small + fixed, so we don't need the candidate
 * pipeline + isFootballPage validation that teams need).
 *
 * Pipeline per competition:
 *   1. If dist/competitions/{slug}.png already exists in the manifest → done.
 *   2. Look up COMP_WIKI[slug] → Wikipedia page summary.
 *   3. Bump thumbnail to TARGET_WIDTH px-wide variant via /thumb/ pattern.
 *   4. Download bytes, write to dist/competitions/{slug}.png.
 *   5. Update dist/comp-logos.json manifest.
 *
 * Polite to Wikipedia: 750ms delay, custom UA, retry-with-backoff on 429s.
 */

import fs    from 'node:fs/promises';
import fssync from 'node:fs';
import path  from 'node:path';
import axios from 'axios';

const WIKI_API_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const USER_AGENT    = 'FMScraper/1.0 (https://www.futbolmundial.com/bots; competitions)';
const REQ_DELAY     = 750;
const TARGET_WIDTH  = 256;
const MISS_RETRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Hand-curated Wikipedia article titles. The English Wikipedia title is
 * canonical — we accept whatever crest/logo Wikipedia uses on that page.
 *
 * If a slug is missing here OR the page doesn't expose a thumbnail, the
 * resolver records `missing: true` and the WP theme's onerror fallback
 * hides the broken image.
 */
const COMP_WIKI = {
	'eng-premier':     'Premier League',
	'esp-laliga':      'La Liga',
	'ger-bundesliga':  'Bundesliga',
	'ita-seriea':      'Serie A',
	'fra-ligue1':      'Ligue 1',
	'por-primeira':    'Primeira Liga',
	'bel-pro':         'Belgian Pro League',
	'eng-champ':       'EFL Championship',
	'uefa-ucl':        'UEFA Champions League',
	'uefa-uel':        'UEFA Europa League',
	'uefa-uecl':       'UEFA Europa Conference League',
	'usa-mls':         'Major League Soccer',
	'mex-ligamx':      'Liga MX',
	'arg-primera':     'Argentine Primera División',
	'bra-serieA':      'Campeonato Brasileiro Série A',
	'concacaf-cc':     'CONCACAF Champions Cup',
	'conmebol-libert': 'Copa Libertadores',
	'conmebol-suda':   'Copa Sudamericana',
	'uefa-euros':      'UEFA Euro 2028',
	'concacaf-gold':   'CONCACAF Gold Cup',
	'conmebol-copaam': '2024 Copa América',
	'caf-afcon':       'Africa Cup of Nations',
	'fifa-wcq':        '2026 FIFA World Cup',
};

function sleep( ms ) {
	return new Promise( r => setTimeout( r, ms ) );
}

function bumpThumbWidth( url, width ) {
	if ( ! url ) return url;
	return url.replace( /\/(\d+)px-/, `/${ width }px-` );
}

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
			title:    data.title || title,
			thumbUrl: bumpThumbWidth( thumb, TARGET_WIDTH ),
		};
	} catch {
		return null;
	}
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

/**
 * Resolves logos for a list of competitions ({ slug, label }).
 *
 * Side effects:
 *   - Writes dist/competitions/{slug}.png for any competition newly resolved.
 *   - Updates dist/comp-logos.json manifest in place.
 */
export async function resolveCompLogos( competitions, opts = {} ) {
	const compsDir     = opts.compsDir;
	const manifestPath = opts.manifestPath;

	if ( ! compsDir || ! manifestPath ) {
		throw new Error( 'resolveCompLogos: compsDir and manifestPath are required' );
	}

	const manifest = await loadManifest( manifestPath );
	const resolved = {};
	const missing  = [];
	let   newDownloads = 0;
	const now = Date.now();

	for ( const comp of competitions ) {
		const { slug, label } = comp;
		if ( ! slug ) continue;

		const cached  = manifest[ slug ];
		const pngPath = path.join( compsDir, `${ slug }.png` );

		if ( cached && ! cached.missing && fssync.existsSync( pngPath ) ) {
			resolved[ slug ] = cached;
			continue;
		}

		if ( cached && cached.missing ) {
			const last = Date.parse( cached.last_tried || 0 ) || 0;
			if ( ( now - last ) < MISS_RETRY_MS ) {
				missing.push( { slug, label, lastTried: cached.last_tried } );
				continue;
			}
		}

		const wikiTitle = COMP_WIKI[ slug ];
		if ( ! wikiTitle ) {
			manifest[ slug ] = {
				label,
				missing:    true,
				reason:     'no COMP_WIKI entry',
				last_tried: new Date().toISOString(),
			};
			missing.push( { slug, label, lastTried: manifest[ slug ].last_tried } );
			continue;
		}

		const summary = await pageSummary( wikiTitle );
		await sleep( REQ_DELAY );

		if ( ! summary ) {
			manifest[ slug ] = {
				label,
				title:      wikiTitle,
				missing:    true,
				last_tried: new Date().toISOString(),
			};
			missing.push( { slug, label, lastTried: manifest[ slug ].last_tried } );
			continue;
		}

		try {
			await downloadImage( summary.thumbUrl, pngPath );
			await sleep( 400 );
			newDownloads++;
			const entry = {
				label,
				title:      summary.title,
				file:       `competitions/${ slug }.png`,
				source:     summary.thumbUrl,
				fetched_at: new Date().toISOString(),
			};
			manifest[ slug ] = entry;
			resolved[ slug ] = entry;
		} catch ( err ) {
			manifest[ slug ] = {
				label,
				title:      summary.title,
				missing:    true,
				last_tried: new Date().toISOString(),
				error:      String( err.message || err ),
			};
			missing.push( { slug, label, lastTried: manifest[ slug ].last_tried } );
		}
	}

	await saveManifest( manifestPath, manifest );

	return { resolved, missing, newDownloads };
}
