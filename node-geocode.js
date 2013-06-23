var fs  = require('fs'),
		d3_dsv = require('dsv'),
		_   = require('underscore'),
		$   = require('jquery');

var CONFIG = {
	input: 'us_hospitals.csv',
	output: 'us_hospitals_geocoded.csv', 
	adrs_format: '{{provider_street_address}}, {{provider_city}}, {{provider_state}}, {{provider_zip_code}}', // Write the format you want to put the address in with case-sensitive column headers in between the double brackets.
	delay: 100,
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
	var csv_data  = d3_dsv.csv.parse(text_data);
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
			if(response.status == 'OK'){
				var lat      = response.results[0].geometry.location.lat;
				var lng      = response.results[0].geometry.location.lng;
				var accuracy = response.results[0].geometry.location_type;
				row['lat']              = lat;
				row['lng']              = lng;
				row['geocode_accuracy'] = accuracy;
				proceedOrStop(arr, index, total, 'success');

			}else if(response.status == 'ZERO_RESULTS'){
				verbose(response.status + ' at row ' + (index+1) + ' of ' + total+'. Skipping...');
				proceedOrStop(arr, index, total, 'skip');

			}else if(response.status == 'OVER_QUERY_LIMIT'){
				STATS.times_hit_ratelimit++
				if (STATS.times_hit_ratelimit > 1){
					CONFIG.wait_time = CONFIG.wait_time * 1.5;
				};
				CONFIG.delay = CONFIG.delay + CONFIG.increase_delay_by;
				verbose('Hit rate limit ' +STATS.times_hit_ratelimit + ' times. '+response.status + ' at row ' + (index+1) + ' of ' + total+'. Waiting '+CONFIG.wait_time+' ms then increasing delay by '+CONFIG.increase_delay_by+' ms to '+CONFIG.delay+' ms...');
				proceedOrStop(arr, index, total, 'try again', CONFIG.delay + CONFIG.wait_time);

			}else if(response.status == "REQUEST_DENIED"){
				verbose(response.status + ' at row ' + (index+1) + ' of ' + total+'. You might have "#" or special characters in your address string. Skipping...');
				proceedOrStop(arr, index, total, 'skip');
			}else{
				verbose('Unhandled error' + response.status + ' at row ' + (index+1) + ' of ' + total+'. Skipping, baking, resetting...');
				proceedOrStop(arr, index, total, 'skip, bake, and reset');
			}
		})
		.fail(function(err){
			verbose('Ajax failed ' + err)
			bakeFile(arr);
		});
	}else{
		proceedOrStop(arr, index, total, 'already geocoded', 0);
	}
}

function bakeAndReset(arr, index, total){
	bakeFile(arr);
	STATS.number_processed = 0;
	CONFIG.input = CONFIG.output;
	startTheShow(CONFIG, index);
}
function skipBakeAndReset(arr, index, total){
	index++;
	bakeAndReset(arr, index, total)
}
function proceedToNext(arr, index, total, delay){
	// If it's normal, either successful or skipped, make sure we haven't hit the end.
	// If we have, bake the file.
	// Also make sure we haven't hit the limit for how many files we want to process before saving.
	// If we have, bake the file.
	index++; // Advance to the next row
	STATS.number_processed++
	if(index < total){
		if(STATS.number_processed < CONFIG.bake_file_every_n_rows){
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
}

function proceedOrStop(arr, index, total, msg, delay){

	if (msg == 'success' || msg == 'skip'){
		proceedToNext(arr, index, total, delay);
	}else if(msg == 'try again'){
		repeatRow(arr, index, total, delay);
	}else if(msg ==  'skip, bake, and reset'){
		skipBakeAndReset(arr, index, total);
	}else if(msg == 'already geocoded'){
		proceedToNext(arr, index, total, delay)
	}
}

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

function verbose(msg){
	if (CONFIG.verbose == true){
		console.log(msg)
	}
}

function JSONtoCSV(json){
	// Add the column headers as the first row
	var csv = flattenForCSV(_.keys(json[0]));
	_.each(json, function(row){
		csv  += flattenForCSV(_.values(row));
	});
	return csv
};

function flattenForCSV(arr){
	var arr_quoted = _.map(arr, function(item){return '"'+item+'"'});
	return arr_quoted.toString() + "\n";
}

function bakeFile(json){
	verbose('Baking file...');
	var csv = JSONtoCSV(json);
	writeFile(csv);
};

function writeFile(file){
	fs.writeFileSync(CONFIG.output, file)
}

startTheShow(CONFIG, 0);