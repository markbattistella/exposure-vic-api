#!/usr/bin/env node

'use strict';

//
// MARK: - modules
//
const fs	= require( 'fs' );
const fetch = require( 'node-fetch' );


//
// MARK: create the variables / constants
//

// get the command line arguments
const args = ( function( argv ) {

    // remove `node` and `script` name
    argv = argv.slice(2);

    // returned object
    var args = {};
    var argName, argValue;

    // loop through each argument
    argv.forEach(function( arg, index ) {

        // seperate argument, for a key/value return
        arg = arg.split( '=' );

        // retrieve the argument name
        argName = arg[0];

        // remove "--" or "-"
        if( argName.indexOf('-') === 0 ) {
            argName = argName.slice(
				argName.slice(0, 2).lastIndexOf('-') + 1
			);
        }

        // associate defined value or initialize it to "true" state
        argValue = (arg.length === 2) ?

            // check if argument is valid number
            parseFloat(arg[1]).toString() === arg[1]

                ? +arg[1]
                : arg[1]

            : true;

        // finally add the argument to the args set
        args[argName] = argValue;
    });

    return args;
})( process.argv );



// api key checks
const apiKey = function() {

    // api not declared
    if( !args.api ) { return 1; }

    // declared but empty
    if( args.api === true ) { return 2; }

    // all good
    if( args.api && args.api !== true ) { return args.api; }

} ( args );



//
// MARK: - check the files and directories we need
//
const req = (() => {

	// where we store things
	const directory	= './docs';
	const datavic	= `${ directory }/datavic.json`;
	const database	= `./database.json`;

	// checks and creation
	if( !fs.existsSync( directory ) ) { fs.mkdirSync( directory ); }

	// array of items
	return { dir: directory, api: datavic, db: database }
})();



//
// MARK: - the script initialiser
//
function init() {
	console.time();
	fetchExposures();
	console.timeEnd();
}



//
// MARK: - 1. fetch the data from datavic
//
function fetchExposures() {

	// api check
	if( apiKey === 1 ) {
        console.error(
			'[x] Exiting: API argument not declared!'
		);
		process.exit( 1 );
		return;
    }
    if( apiKey === 2 ) {
        console.error(
			'[x] Exiting: API key not provided!'
		);
		process.exit( 1 );
		return;
    }

	// url: Data Victoria API
	const url = new URL(
		'https://discover.data.vic.gov.au/api/3/action/datastore_search'
	);

	// url: parameters
	url.searchParams.append(
		'resource_id', 'afb52611-6061-4a2b-9110-74c920bede77'
	);

	url.searchParams.append(
		'limit', '10000'
	);

	// fetch the data
	fetch( url )
		.then( res => res.json() )

		.then( async data => {

			// send off data to be checked against database
			const valid = await validateData( data );

			// send off data to be checked against database
			const database = await checkDatabase( valid );

			// fetch the coordinates
			const coordinates = await fetchCoordinates( database );

			// add the coordinates to api file
			const api = await addCoordinates( data, coordinates );

			// write items to file
			await writeFiles( api, coordinates );
		})

		.catch( err => {
			console.error( `[x] Error: ${ err }` );
			process.exit( 1 );
		});
}



//
// MARK: - 2. remove the bad characters
//
function validateData( input ) {

	const sanitised = JSON.stringify( input, null, 2 )
						.replace(/\\t/g, '')
						.replace(/\\r/g, '')
						.replace(/\\n/g, '')
						.replace(/\\v/g, '')
						.replace(/\\h/g, '');

	return JSON.parse( sanitised );
}



//
// MARK: - 3. check if any of the results are in the database
//
function checkDatabase( input ) {

	// 3a. exlude any that have null address or postcode
	const inputNoNull = input.result.records.filter( item => {
		if( !(item.Site_streetaddress === null ||
			item.Site_postcode === null) ) {
			return item
		}
	})

	// -- select only certain fields
	.map( item => ({
			Suburb:				item.Suburb,
			Site_streetaddress: item.Site_streetaddress,
			Site_state: 		item.Site_state,
			Site_postcode: 		item.Site_postcode
	}) )

	// -- sort by ID
	.sort( ( a, b ) => {
		return a._id - b._id;
	});

	// -- get the unique data
	const data = [ ...new Set(
		inputNoNull.map( item1 =>
			item1.Suburb 				+
			item1.Site_streetaddress	+
			item1.Site_state			+
			item1.Site_postcode
		)
	)].map(
		item1 => inputNoNull.find(
			item2 =>
				item2.Suburb 				+
				item2.Site_streetaddress	+
				item2.Site_state			+
				item2.Site_postcode
			== item1
		)
	);

	// -- read the database
	const db = fs.readFileSync( req.db );
	const database = db ? JSON.parse( db ) : {};

	// append new items
	const mergeJSON = ( ( file1, file2 ) =>
		Object.values( [ ...file1, ...file2 ]
			.reduce( ( left, right ) => {
				const key = `${right.Suburb} ${right.Site_streetaddress} ${right.Site_state} ${right.Site_postcode}`;
				left[key] = left[key] || right;

				return left;
			}, {} )
		)
	);

	// return it
	return mergeJSON( database, data );
}



//
// MARK: - 4. loop all items in database, fetch the coordinates
//
async function fetchCoordinates( input ) {

	let geocodedSites = [];

	// loop over the locations
	for (let x = 0; x < input.length; x++) {
		try {
			const result = await getGeocode( input[x] );
			geocodedSites.push( result );
		} catch( err ) {
			console.log( `[x] Error: ${ err }` );
			process.exit( 1 );
		}
	}

	// return it
	return geocodedSites;
}



//
// MARK: - 5. re-check the results are in the database
//
function addCoordinates( data, coordinates ) {

	const dataapi = data.result.records;

	let arr = [];

	// loop over the locations
	for (let x = 0; x < dataapi.length; x++) {
		coordinates.filter( item2 => {

			if( dataapi[x].Suburb === item2.Suburb &&
				dataapi[x].Site_streetaddress === item2.Site_streetaddress &&
				dataapi[x].Site_state === item2.Site_state &&
				dataapi[x].Site_postcode === item2.Site_postcode
			) {
				// -- append the coordinates to the items
				const fulldata = {
					...dataapi[x],
					latitude: item2.latitude,
					longitude: item2.longitude
				}
				arr.push( fulldata );
			}
		});
	}

	// return it
	return arr;
}



//
// MARK: - 6. write files to system
//
function writeFiles( file1, file2 ) {

	// stringify the inputs
	const stringFile1 = JSON.stringify( file1, undefined, 2 );
	const stringFile2 = JSON.stringify( file2, undefined, 2 );

	// write them to disk
	fs.writeFileSync( req.api, stringFile1 );
	fs.writeFileSync( req.db,  stringFile2 );
}



//
// MARK: - function: get the coordinates
//
async function getGeocode( site ) {

	// build the address
	const query = `${site.Site_streetaddress} ${site.Suburb } ${site.Site_postcode } ${site.Site_state} Australia`;


	// 1. skip any with existing coordinates
	if( site.latitude && site.longitude || site.skip ) {
		console.error( `[✔] Skipping: ${ query }` );
		return Promise.resolve( site );
	}

	// 2. fetch only missing items
	console.log( `[⦿] Geocoding: ${ query }` );

	// url: Data Victoria API
	const url = new URL(
		'http://api.positionstack.com/v1/forward'
	);

	// url: parameters
	url.searchParams.append(
		'access_key', apiKey
	);

	url.searchParams.append(
		'region', 'Victoria'
	);

	url.searchParams.append(
		'country', 'AU'
	);

	url.searchParams.append(
		'limit', '1'
	);

	// build the search query
	url.searchParams.append(
		'query', query
	)

	// fetch the data
	return fetch( url )
		.then( res => res.json() )
		.then( data => {

			const latitude		= data.data[0].latitude;
			const longitude		= data.data[0].longitude;
			const label			= data.data[0].label;
			const confidence	= data.data[0].confidence;

			return {
				...site,
				confidence,
				latitude,
				longitude,
				label
			}
		})

		.catch( err => {
			console.log( `    [x] Failed: ${ query }` );
			return { ...site, skip: true }
		});
}

//
// MARK: - success: if we got to here
//
init();
