var async = require("async"),
	fs = require("fs"),
	helpers = require("./helpers"),
	https = require("https"),
	mustache = require("mustache"),
	querystring = require("querystring"),
	url = require("url"),
	util = require("util");


function start(response, request, authentication) {

	console.log("Request handler 'start' was called.");

	// Much easier to build out the async.waterfall skeleton first, 
	// and ensuring callbacks are in the right places.
	// Reference: https://github.com/caolan/async#waterfall
	async.waterfall([

		function(callback) {
			getCurrentSprint(request, callback);
		},
		
		function(wipSprintObj, callback) {
			getIssues(authentication, wipSprintObj, callback);
		},

		function(wipSprintObj, callback) {
			collectSubtasks(authentication, wipSprintObj, callback);
		},

		// CUSTOMIZE DATA OUTPUT HERE:
		// Filter/Format the data. This is where you control what 
		// you want to send to the UI layer.
		function(completeSprintObj, callback) {
			formatForTable(completeSprintObj, callback);
		}

	],	// Render HTML...Finally!
		function(err, tableFriendlySprintObj) {

			console.log("Rendering HTML");
			console.log(util.inspect(tableFriendlySprintObj, { showHidden: false, depth: null })); // infinite depth

			sendToTemplate(response, "index.html", tableFriendlySprintObj);

	});
} // start


function error(response) {
	console.log("No request handler found, aka page not found.");

	response.writeHead(404, {
		"Content-Type": "text/html"
	});
	response.write("<h2>404 Not found</h2>");
	response.write("<p>Please check your path again.</p>");

	response.end();

} // error


exports.start = start;
exports.error = error;
