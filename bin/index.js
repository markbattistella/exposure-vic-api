#!/usr/bin/env node

'use strict'

//
// MARK: import the modules
//

// access file system
const fs = require('fs');

// use https
const https = require('https');

// xhttp requests
const axios = require('axios');



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



//
// HELP: command line help
//
if( args.help ) {
    return console.log(
        "insert help here"
    );
}

// api key checks
const apiKey = function() {

    // api not declared
    if( !args.api ) { return 1;    }

    // declared but empty
    if( args.api === true ) { return 2; }

    // all good
    if( args.api && args.api !== true ) { return args.api; }

} ( args );



//
// MARK: download the data vic exposures json
//
const dataURL = new URL('https://discover.data.vic.gov.au/api/3/action/datastore_search');

// add on the parameters
dataURL.searchParams.append(
	'resource_id',
	'afb52611-6061-4a2b-9110-74c920bede77'
);

dataURL.searchParams.append(
	'limit',
	'1000'
);

dataURL.searchParams.append(
	'records_format',
	'objects'
);

dataURL.searchParams.append(
	'distinct',
	'1'
);

dataURL.searchParams.append(
	'fields',
	'Suburb,Site_title,Site_streetaddress,Site_postcode'
);

// download the JSON
https.get( dataURL, ( res ) => {

	const workingDirectory = './wip';

	// check the working folder exists
	if( !fs.existsSync( workingDirectory ) ) {

		// make the directory
		fs.mkdirSync(workingDirectory);

	}

	// where to same it
	const pathToFile = `./wip/file.json`;
    const filePath = fs.createWriteStream( pathToFile );

	// download the file
	res.pipe( filePath );

	// when completed trigger
	filePath.on( 'finish', () => {

		// close the file
		filePath.close();

		// log it
		console.log('[i] Downloaded Data Vic exposure sites');
	});
});










// parse the json
fs.readFile( './wip/file.json',

	// callback function that is called
	// when reading file is done
	function( err, data ) {

		// json data
		var jsonData = data;

		// parse json
		var jsonParsed = JSON.parse(jsonData);

		// access elements
		// console.log(jsonParsed.result.records);

		var addressArray = [];

		for( let i = 0; i < jsonParsed.result.records.length; i++ ) {

			if( jsonParsed.result.records[i].Site_streetaddress !== null ) {

				const address = (
					jsonParsed.result.records[i].Site_streetaddress.replace(/[\n\r\t]+/g, '')
				);
				const suburb = (
					jsonParsed.result.records[i].Suburb.replace(/[\n\r\t]+/g, '')
				);
				const postcode = (
					jsonParsed.result.records[i].Site_postcode.replace(/[\n\r\t]+/g, '')
				);
				const state = 'Victoria';
				const country = 'Australia';

				const fullAddress = `${address} ${suburb} ${postcode} ${state} ${country}`;

				// console.log( fullAddress.replace(/[\n\r\t]+/g, '') );
				addressArray.push( fullAddress )
			}
		}

		console.log( Array.from(new Set(addressArray)).length );

		console.log( addressArray.length );
	}
);

























// end of file;
