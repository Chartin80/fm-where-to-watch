/**
 * Where to Watch — bi-daily scraper.
 *
 * Pulls US TV broadcast schedules for ~23 soccer competitions from
 * worldsoccertalk.com and writes a single normalised JSON document to
 * dist/where-to-watch.json. The Fútbol Mundial WordPress plugin reads that
 * JSON via a public raw.githubusercontent.com URL once per 48h and caches it
 * in a transient.
 *
 * Design notes:
 * - Every fetch is wrapped in retry-with-jitter; partial failures don't
 *   fail the whole run. The output JSON includes a `partial: true` flag
 *   when ANY competition couldn't be scraped, so the WP side can surface
 *   a notice without nuking the entire schedule.
 * - We intentionally never throw on parse errors; we log and skip. This is
 *   a content scraper — pages WILL change shape — and the JSON we already
 *   have on disk is "stale but correct" until the next successful run.
 * - DOM selectors are brittle by definition. Adjust EXTRACT_* constants
 *   whenever WST changes their template.
 */

import fs    from 'node:fs/promises';
import path  from 'node:path';
import url   from 'node:url';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { DateTime } from 'luxon';

import { COMPETITIONS } from './competitions.js';
import { normalizeChannels } from './broadcasters.js';

const __dirname  = path.dirname( url.fileURLToPath( import.meta.url ) );
const ROOT       = path.join( __dirname, '..' );
const DIST_DIR   = path.join( ROOT, 'dist' );
const OUT_FILE   = path.join( DIST_DIR, 'where-to-watch.json' );
const BASE_URL   = 'https://worldsoccertalk.com';
const USER_AGENT = 'Mozilla/5.0 (compatible; FMScraper/1.0; +https://www.futbolmundial.com/bots)';
const REQ_DELAY  = 1500; // polite delay between requests, ms
const MAX_RETRY  = 3;

const DRY_RUN = !! process.env.DRY_RUN;

/* ---------- HTTP helpers ---------- */

async function sleep( ms ) {
	return new Promise( r => setTimeout( r, ms ) );
}

async function fetchHtml( href ) {
	let lastErr;
	for ( let attempt = 1; attempt <= MAX_RETRY; attempt++ ) {
		try {
			const res = await axios.get( href, {
				timeout: 20_000,
				headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
				validateStatus: s => s >= 200 && s < 400,
			} );
			return res.data;
		} catch ( err ) {
			lastErr = err;
			const wait = 1000 * attempt + Math.floor( Math.random() * 500 );
			console.warn( `[fetch] attempt ${ attempt } failed for ${ href } — retrying in ${ wait }ms` );
			await sleep( wait );
		}
	}
	throw lastErr;
}

/* ---------- Parser ---------- */

/**
 * WST schedule pages render as alternating day headers and <ul>/<li> match
 * rows. We walk the document in DOM order and keep the "current date" as
 * state, attaching every subsequent <li.text-stvsMatchHour parent>… row to it.
 *
 * Per-row markup (May 2026):
 *   <li class="...">
 *     <span class="text-stvsMatchHour ...">07:30 AM ET</span>
 *     <div>
 *       <h4 class="text-stvsMatchTitle">Liverpool vs. Chelsea (English Premier League)</h4>
 *       <div class="flex flex-wrap gap-[3px_5px]">
 *         <div class="text-stvsProviderLink ..."><a>NBCSN</a></div>
 *         <div class="text-stvsProviderLink ..."><a>Peacock Premium</a></div>
 *       </div>
 *     </div>
 *   </li>
 */
function parseCompetitionPage( html, competition ) {
	const $       = cheerio.load( html );
	const matches = [];

	let currentDateLabel = null;

	// Walk every direct descendant in document order.
	$( 'article, main, .entry-content, body' ).first()
		.find( 'h2, h3, h4, li' )
		.each( ( _, el ) => {
			const $el = $( el );
			const tag = ( el.tagName || el.name || '' ).toLowerCase();

			if ( tag === 'h2' || tag === 'h3' || tag === 'h4' ) {
				const txt = $el.text().trim();
				if ( /\b(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b/.test( txt ) ) {
					currentDateLabel = txt;
				}
				return;
			}

			if ( tag !== 'li' || ! currentDateLabel ) return;

			const $hour = $el.find( '> span' ).first();
			if ( ! $hour.length || ! /\bET\b|AM|PM/.test( $hour.text() ) ) return;

			const $title = $el.find( 'h4' ).first();
			if ( ! $title.length ) return;

			// "Liverpool vs. Chelsea (English Premier League)" — strip the
			// trailing "(competition)" parenthetical.
			const titleRaw = $title.text().replace( /\s+/g, ' ' ).trim();
			const matchRaw = titleRaw.replace( /\s*\([^)]*\)\s*$/, '' );

			const teams = splitTeams( matchRaw );
			if ( ! teams ) return;

			const timeRaw = $hour.text().trim();

			// Channel chips: provider links live in sibling div(s) below <h4>.
			const channelTexts = [];
			$el.find( 'a' ).each( ( __, a ) => {
				const t = $( a ).text().trim();
				if ( t ) channelTexts.push( t );
			} );
			// Dedupe — WST renders mobile + desktop variants of each link.
			const channelRaw = Array.from( new Set( channelTexts ) ).join( ', ' );

			const kickoff = parseKickoff( currentDateLabel, timeRaw );
			if ( ! kickoff ) return;

			matches.push( {
				id:           shortId( competition.slug, kickoff, teams ),
				competition:  competition.slug,
				home:         teams.home,
				away:         teams.away,
				home_slug:    slugify( teams.home ),
				away_slug:    slugify( teams.away ),
				kickoff_utc:  kickoff.toUTC().toISO(),
				kickoff_et:   kickoff.setZone( 'America/New_York' ).toFormat( "yyyy-LL-dd'T'HH:mm" ),
				channels:     normalizeChannels( channelRaw ),
				channels_raw: channelRaw,
			} );
		} );

	return matches;
}

function splitTeams( raw ) {
	// Common separators: " v ", " vs ", " vs. ", "—", " - "
	const m = raw.split( /\s+(?:vs?\.?|—|–|-)\s+/i );
	if ( m.length !== 2 ) return null;
	return { home: m[ 0 ].trim(), away: m[ 1 ].trim() };
}

function parseKickoff( dateLabel, timeRaw ) {
	// WST is US Eastern by default. Pull "5:30 pm ET" or "8:00 am" — assume ET.
	const cleanTime = timeRaw.replace( /et|est|edt/ig, '' ).trim();
	const cleanDate = dateLabel.replace( /^[^,]+,\s*/, '' ); // drop "Saturday, "

	// luxon can parse a wide set; try a couple of formats
	const formats = [
		'LLLL d, yyyy h:mm a',
		'LLLL d, yyyy h a',
		'LLLL d h:mm a',
	];
	for ( const fmt of formats ) {
		const dt = DateTime.fromFormat(
			`${ cleanDate } ${ cleanTime }`.replace( /\s+/g, ' ' ),
			fmt,
			{ zone: 'America/New_York' }
		);
		if ( dt.isValid ) {
			return dt.year < 2020
				? dt.set( { year: DateTime.now().year } )
				: dt;
		}
	}
	return null;
}

function slugify( s ) {
	return s.toLowerCase().replace( /[^a-z0-9]+/g, '-' ).replace( /(^-|-$)/g, '' );
}

function shortId( comp, dt, teams ) {
	const stamp = dt.toFormat( 'yyyyLLddHHmm' );
	return `${ comp }-${ stamp }-${ slugify( teams.home ) }-vs-${ slugify( teams.away ) }`;
}

/* ---------- Driver ---------- */

async function run() {
	console.log( `[scraper] starting — ${ COMPETITIONS.length } competitions, dry=${ DRY_RUN }` );

	const allMatches = [];
	const errors     = [];

	for ( const comp of COMPETITIONS ) {
		if ( ! comp.wstSlug ) {
			console.log( `[skip] ${ comp.slug } — no wstSlug configured` );
			continue;
		}
		const url = `${ BASE_URL }/${ comp.wstSlug }-tv-schedule/`;
		try {
			console.log( `[fetch] ${ comp.slug } ← ${ url }` );
			const html  = await fetchHtml( url );
			const found = parseCompetitionPage( html, comp );
			console.log( `   → ${ found.length } matches` );
			allMatches.push( ...found );
		} catch ( err ) {
			console.error( `[error] ${ comp.slug }: ${ err.message }` );
			errors.push( { competition: comp.slug, message: err.message } );
		}
		await sleep( REQ_DELAY );
	}

	// Sort by kickoff
	allMatches.sort( ( a, b ) => a.kickoff_utc.localeCompare( b.kickoff_utc ) );

	const payload = {
		generated_at: new Date().toISOString(),
		source:       'worldsoccertalk.com',
		partial:      errors.length > 0,
		errors,
		competitions: COMPETITIONS.map( c => ( {
			slug:     c.slug,
			label:    c.label,
			region:   c.region,
			priority: c.priority,
		} ) ),
		matches:      allMatches,
	};

	if ( DRY_RUN ) {
		console.log( JSON.stringify( payload, null, 2 ).slice( 0, 1200 ) + '...\n[dry-run; not writing file]' );
		return;
	}

	await fs.mkdir( DIST_DIR, { recursive: true } );
	await fs.writeFile( OUT_FILE, JSON.stringify( payload, null, 2 ), 'utf8' );
	console.log( `[done] wrote ${ allMatches.length } matches to ${ OUT_FILE }` );
}

run().catch( err => {
	console.error( '[fatal]', err );
	process.exit( 1 );
} );
