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


// Pass response, request, authentication, query

	var query = parseURL(request.url, true);

	var currentSprint = "Sprint " + query["sprint"];


// Then get back JSON object with everything




	async.series([
		function collectIssues(callback) {

			console.log("Start querying " + currentSprint);

			// TODO: Add back long comments about other paths that I explored and why they did not work.

			// HACK
			var sprintQuery = "/rest/api/2/search?jql=sprint%20%3D%20%22" + 
				currentSprint.replace(/ /g, "%20") + // HACK to convert space to a HTML entity.
				"%22%20and%20(type%20%3D%20%22story%22%20or%20type%20%3D%20%22bug%22)%20order%20by%20rank%20asc";

			var options = {
				host: authentication.jiraHost,
				// Only url that returns tickets in the same order as in the sprints.
				path: sprintQuery,
				auth: authentication.myAuth
			};


			var req = https.request(options, function(res) {
				//console.log("statusCode: ", res.statusCode);
				//console.log("headers: ", res.headers);

				var data = "";

				res.on("data", function(chunk) {
					data += chunk;
					//process.stdout.write(json);
				});

				// Build list of all stories and bugs, most of which does not belong to our sprint. See path above.	
				// Solution to SyntaxError: Unexpected end of input:
				// Source: http://stackoverflow.com/questions/13212956/node-js-and-json-run-time-error
				res.on("end", function buildEntireList() {

					// TODO: rename sprintObj to something more appropriate. Rename obj to sprintItems or issues (or something similar).
					var sprintObj = JSON.parse(data);

					totalIssues = sprintObj.total;

					rawCompleteOutput = sprintObj;

					collectSubtasks({
						"jiraHost": authentication.jiraHost,
						"myAuth": authentication.myAuth,
						"callback": callback,
						"sprintObj": sprintObj, 
						"currentSprint": currentSprint, 
						"totalIssues": totalIssues
					});

					console.log("There are " + totalIssues + " issues in " + currentSprint);
				});

			}); // req = https.request

			req.end();

			req.on("error", function(e) {
				console.error(e);
			});

		} // collectIssues
	],

	// Callback from async.series. resultsArray stores callback result from each task.
	function outputData(err, resultsArray) {
		// Thank you stackoverflow.com for a quick workaround for viewing objects with circular references: use util.inspect in Node.js.
		//console.log("response: " + util.inspect(response));

		//console.log("testFunction: " + testFunction().test);

		// Great tutorial on mustache.js + node.js: http://devcrapshoot.com/javascript/nodejs-expressjs-and-mustachejs-template-engine
		// Wrap the data in a global object... (mustache starts from an object then parses)
		var data = {
			"finalData": {"foo": "bar"}
			//"finalData": resultsArray[0]
		};

		sendToTemplate(response, "index.html", data);

	}); // async.series
} // start


function show(response) {
	console.log("Request handler 'show' was called.");

	fs.readFile("/tmp/test.png", "binary", function(error, file) {
		if (error) {
			response.writeHead(500, {
				"Content-Type": "text/plain"
			});
			response.write(error + "\n");
			response.end();
		} else {
			response.writeHead(200, {
				"Content-Type": "image/png"
			});
			response.write(file, "binary");
			response.end();
		}
	});

} // show


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
exports.show = show;
exports.error = error;
