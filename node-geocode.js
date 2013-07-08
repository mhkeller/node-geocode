var fs  = require('fs'),
		dsv = require('dsv'),
		_   = require('underscore'),
		$   = require('jquery');

var CONFIG = {
	input: 'us_hospitals_geocoded.csv',
	output: 'us_hospitals_geocoded.csv', 
	adrs_format: '{{provider_street_address}}, {{provider_city}}, {{provider_state}}, {{provider_zip_code}}', // Write the format you want to put the address in with case-sensitive column headers in between the double brackets.
	delay: 150,
	wait_time: 5000,
	increase_delay_by: 100,
	bake_file_every_n_rows: 100, 
	verbose: true
};

var STATS = {
	times_hit_ratelimit: 0,
	number_processed: 0
}

function startTheShow(CONFIG, starting_index){
	var csv_data = loadCSV(CONFIG.input);
	processRows(csv_data, starting_index)
};
 
function loadCSV(path){
	var text_data = fs.readFileSync(path).toString();
	var csv_data  = dsv.csv.parse(text_data);
	return csv_data
};

function processRows(arr, starting_index){
	var total = arr.length;
	checkForGeocoding(arr, starting_index, total)
};

function checkForGeocoding(arr, index, total){
	var row = arr[index];
	if (row['lat'] === undefined || row['lng'] === undefined || row['lat'] === '' || row['lng'] === '' || row['lat'] === null || row['lng'] === null){
		geocodeRow(row).done(function(response){
			if (response.status == 'OK'){
				var lat      = response.results[0].geometry.location.lat;
				var lng      = response.results[0].geometry.location.lng;
				var accuracy = response.results[0].geometry.location_type;
				row['lat']              = lat;
				row['lng']              = lng;
				row['geocode_accuracy'] = accuracy;
				reportStatus('Geocoded ' + (index + 1) + ' of ' + total)
				proceedToNext(arr, index, total, CONFIG.delay);

			}else if(response.status == 'ZERO_RESULTS'){
				reportStatus(response.status + ' at row ' + (index+1) + ' of ' + total+'. Skipping...');
				// This skips the row, which is the same as success because it proceeds to the next row
				proceedToNext(arr, index, total, CONFIG.delay);

			}else if(response.status == 'OVER_QUERY_LIMIT'){
				STATS.times_hit_ratelimit++ // Log that we've hit the rate limit

				if (STATS.times_hit_ratelimit > 1){ // If we've hit the rate limit at least once before...
					CONFIG.wait_time = CONFIG.wait_time * 1.5;  // Then multiply by 1.5 the time to wait after you hit the rate limit before starting up again.   
				};
				CONFIG.delay = CONFIG.delay + CONFIG.increase_delay_by; // Also increase the time between requests
				reportStatus('Hit rate limit ' +STATS.times_hit_ratelimit + ' times. '+response.status + ' at row ' + (index+1) + ' of ' + total+'. Waiting '+CONFIG.wait_time+' ms then increasing delay by '+CONFIG.increase_delay_by+' ms to '+CONFIG.delay+' ms...');
				
				// This shouldn't advance, it should redo the row
				repeatRow(arr, index, total, CONFIG.delay + CONFIG.wait_time);

			}else if(response.status == "REQUEST_DENIED"){
				reportStatus(response.status + ' at row ' + (index+1) + ' of ' + total+'. You might have "#" or special characters in your address string. Skipping...');
				
				// Skip
				proceedToNext(arr, index, total, CONFIG.delay);
			}else{
				reportStatus('Unhandled error' + response.status + ' at row ' + (index+1) + ' of ' + total+'. Skipping...');
				
				// Skip
				proceedToNext(arr, index, total, CONFIG.delay);
			};
		})
		.fail(function(err){
			reportStatus('Ajax error' + response.status + ' at row ' + (index+1) + ' of ' + total+'. Skipping...');
			
			// Skip
			proceedToNext(arr, index, total, CONFIG.delay);
		});
	}else{
		reportStatus('Already geocoded, skipping row ' + index + ' of ' + total)
		// This skips with a delay of 0 so that it goes through the list quickly
		proceedToNext(arr, index, total, 0);
	};
};

function bakeAndReset(arr, index, total){
	bakeFile(arr);
	STATS.number_processed = 0;
	CONFIG.input = CONFIG.output;
	startTheShow(CONFIG, index);
};

function proceedToNext(arr, index, total, delay){
	// If it's normal, either successful or skipped, make sure we haven't hit the end.
	// If we have, bake the file.
	// Also make sure we haven't hit the limit for how many files we want to process before saving.
	// If we have, bake the file.
	index++; // Advance to the next row
	STATS.number_processed++
	if(index < total){
		if(STATS.number_processed < CONFIG.bake_file_every_n_rows){ // If it goes over the bake_file_every_n_rows number, then save the file and start over, skipping the previously geocoded rows
			_.delay(checkForGeocoding, delay, arr, index, total)
		}else{
			bakeAndReset(arr, index, total)
		}
	}else{
		bakeFile(arr);
	}
};
function repeatRow(arr, index, total, delay){
	// Don't change index because we're not advancing to the next row
	// Pass in delay so you can give it the extra wait time
	_.delay(checkForGeocoding, delay, arr, index, total)
};

function getRowAddressFromTemplate(row){
	var adrs_getter_arr = CONFIG.adrs_format.replace(/\{\{/g,'row["').replace(/\}\}/g,'"]').split(',');
	var adrs_string_arr = _.map(adrs_getter_arr, function (item){ return eval(item)});
	var adrs_string     = adrs_string_arr.join(', ');
	return adrs_string
};

function geocodeRow(row){
	return $.ajax({
		url: 'http://maps.googleapis.com/maps/api/geocode/json?address=' + getRowAddressFromTemplate(row) + '&sensor=false'
	});
};

function reportStatus(msg){
	if (CONFIG.verbose == true){
		console.log(msg);
	};
};

function bakeFile(json){
	reportStatus('Baking file...');
	var csv = dsv.csv.format(json);
	writeFile(csv);
};

function writeFile(file){
	fs.writeFileSync(CONFIG.output, file);
};

startTheShow(CONFIG, 0);
