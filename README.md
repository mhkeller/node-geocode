# Node Geocode.js

A geocoder in Node.js using the Google Maps API. It includes a number of features to help in geocoding large datasets of addresses such as automatically finding rows that need to be geocoded and playing nice with Google's rate limits.

## Usage

All options are set in ``CONFIG``

````
var CONFIG = {
	input: 'us_hospitals.csv',
	output: 'us_hospitals_geocoded.csv', 
	adrs_format: '{{provider_street_address}}, {{provider_city}}, {{provider_state}}, {{provider_zip_code}}',
	delay: 100,
	wait_time: 5000,
	increase_delay_by: 50,
	bake_file_every_n_rows: 100, 
	verbose: true
};
````

``input`` is the path to the csv to geocode.
``output`` is the path to the csv to write.
``adrs_format`` takes the names of your columns in ``{{ }}``. Any other formatting, such as the commas you see, are passed in as plain-text.
``delay`` is the time, in milliseconds, in between requests.
``wait_time`` is the time to wait after you hit the rate limit before starting up again.
``increase_delay_by`` is the time that ``delay`` increases by every time you hit the rate limit.
``bake_file_every_n_rows`` lets you specify how often you want to save the file during processing so you write incrementally. This will not stop the geocoding process -- it's more of an insurance policy that in case something goes wrong at the very end, you won't have to start from scratch.
``verbose`` set to false to silence log messages.