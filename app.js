// Load the https module to create an https server.
var https = require("https"),
	fs = require("fs"),
	async = require("async"),
	sys = require("sys"),
	mustache = require("mustache"),
	jiraHost = "",
	myAuth = "";

// Get authentication information from local file (not checked into GitHub). For performance reasons, 
// this is only called when server starts up, because the JIRA host name and user authentication should 
// not change too often.
// Source: http://stackoverflow.com/questions/11375719/read-json-data-into-global-variable-in-node-js
(function authenticateUser() {
	console.log("authenticateUser()");

	fs.readFile('conf/settings.json', 'UTF8', function(err, data) {
		if (err) {
			return console.log(err);
		} else {
			var loginInfo = JSON.parse(data);
			jiraHost = loginInfo.jiraHost;
			myAuth = loginInfo.auth;
		}
	});
}());


var hitURL3 = function(options, index, func, callback) {

	var req = https.request(options, function(res) {

		var data = "";

		res.on("data", function(chunk) {
			data += chunk;
			//process.stdout.write(json);
		});

		// Solution to SyntaxError: Unexpected end of input:
		// Source: http://stackoverflow.com/questions/13212956/node-js-and-json-run-time-error
		res.on("end", function() {
			func(data);
		});
	});

	req.end();

	req.on("error", function(e) {
		console.error(e);
	});

} // hitURL3





var printStoriesAndSubtasks = function(callback, storyList, outputObject, currentSprint, currentSprintCount) {
	var fields = "";
	var displayString = "";

	for (var i = 0; i < storyList.length; i++) {
		var storyListElement = storyList[i],
			tempOutputObject = {};
		if (storyListElement) {
			fields = storyListElement.info.fields;

			////
			tempOutputObject["key"] = storyListElement.key;
			tempOutputObject["type"] = (fields.issuetype.name === "Story" ? "Story Points: " +
				(fields.customfield_10002 ? parseInt(fields.customfield_10002) : "") : fields.issuetype.name);

			tempOutputObject["description"] = fields.summary;
			tempOutputObject["status"] = fields.status.name;
			tempOutputObject["release"] = (fields.fixVersions[0] && fields.fixVersions[0].name ? fields.fixVersions[0].name : "");
			////

			//////For Stickies (hack, need this now)
			tempOutputObject["type2"] = fields.issuetype.name;
			tempOutputObject["storyPoints"] = (fields.issuetype.name === "Story" ? (fields.customfield_10002 ? parseInt(fields.customfield_10002) : "N/A") : "");
			tempOutputObject["release2"] = (fields.fixVersions[0] && fields.fixVersions[0].name ? fields.fixVersions[0].name : "N/A");
			//////



			displayString =
				(fields.issuetype.name === "Story" ? "Story Points: " +
				(fields.customfield_10002 ? parseInt(fields.customfield_10002) : "") : fields.issuetype.name) + "\t" +

			storyListElement.key + "\t" +
				fields.summary + "\t" +
			//(fields.customfield_10002 ? parseInt(fields.customfield_10002) : "") + "\t" + // Story points
			fields.status.name + "\t" +
				(fields.fixVersions[0] && fields.fixVersions[0].name ? fields.fixVersions[0].name : "") + "\t";

			// Print subtasks if story has them.
			if (storyListElement.subtasks) {
				var subtasks = storyListElement.subtasks,
					numSubtasks = subtasks.length;
				if (numSubtasks > 0) {
					//displayString += "There are " + numSubtasks + " subtasks.";
					for (var subtaskIndex = 0; subtaskIndex < numSubtasks; subtaskIndex++) {
						// To reduce a name to the first initials (capitalized): Myron Yeung becomes MY.
						displayString += (subtasks[subtaskIndex].fields.assignee.displayName).replace(/\W*(\w)\w*/g, '$1').toUpperCase() + ": ";
						displayString += subtasks[subtaskIndex].fields.timetracking.originalEstimate + ", ";

						////
						var displayName = (subtasks[subtaskIndex].fields.assignee.displayName).replace(/\W*(\w)\w*/g, '$1').toUpperCase(),
							originalEstimateSeconds = subtasks[subtaskIndex].fields.timetracking.originalEstimateSeconds;
						remainingEstimateSeconds = subtasks[subtaskIndex].fields.timetracking.remainingEstimateSeconds;

						if (tempOutputObject[displayName]) {
							// There is already one or more tasks for this story/bug assigned to this person.
							tempOutputObject[displayName] += (remainingEstimateSeconds / 3600);
						} else {
							tempOutputObject[displayName] = remainingEstimateSeconds / 3600;
						}
						////
					}
				}
			}

			// HACK: Print subtasks for stickies.
			if (storyListElement.subtasks) {
				var subtasks2 = storyListElement.subtasks,
					numSubtasks2 = subtasks2.length;
				if (numSubtasks2 > 0) {

					tempOutputObject["subtasks"] = [];
					for (var subtaskIndex2 = 0; subtaskIndex2 < numSubtasks2; subtaskIndex2++) {
						//console.log(subtasks2[subtaskIndex2]);
						tempOutputObject["subtasks"][subtaskIndex2] = {};
						tempOutputObject["subtasks"][subtaskIndex2]["name"] = subtasks2[subtaskIndex2].fields.assignee.displayName;
						tempOutputObject["subtasks"][subtaskIndex2]["estimate"] = subtasks2[subtaskIndex2].fields.timetracking.remainingEstimate;
					}
				}
			}

			////
			outputObject.push(tempOutputObject);
			////

			//console.log(displayString);

			// Count number of legit stories in out sprint. Remember, storyList contains null references because for some inane reason, 
			// the API does not allow me to return just the stories in a sprint, in the correct order.
			currentSprintCount++;
		}
	}

	console.log("Done! Number of stories in " + currentSprint + ": " + currentSprintCount);

	// This tells the app that it is done getting all the data and is ready to pass control over to outputData().
	callback(null, "foo");

} // printStoriesAndSubtasks

// Ultimately an element of storyList looks like this for example:
//	storyList[1] = {
//	"key" : "U-929",
//	"info" : { Big JSON object returned from https://perfectsense.atlassian.net/rest/api/2/issue/ULIVE-929 }
//	"subtasks" {[array of subtasks]}
//	}





var collectSubtasks = function(callback, storyList, outputObject, currentSprint, currentSprintCount) {
	var queries = []; // this will be fed to async.parallel() later

	var makeQuery = function makeQuery(index, subtaskURL) { // factory function to create the queries
		return function doQuery(callback) {
			////console.log(index);

			var options = {
				host: jiraHost,
				path: subtaskURL,
				auth: myAuth
			};

			hitURL3(options, index, function addSubtask(data) {

				var obj = JSON.parse(data);

				// Add subtask to parent story. I am adding the entire subtask, because I want to sacrifice a bit of performance 
				// for flexibility in the future.
				storyList[index].subtasks = storyList[index].subtasks || [];
				storyList[index].subtasks.push(obj);

				callback();

			}, callback);

		};
	};

	// Build the list of queries to be done in parallel
	for (var i = 0; i < storyList.length; i++) {
		var storyListElement = storyList[i];
		if (storyListElement) {
			var subtasks = storyListElement.info.fields.subtasks,
				numSubtasks = subtasks.length;
			if (numSubtasks > 0) {
				for (var subtaskIndex = 0; subtaskIndex < numSubtasks; subtaskIndex++) {
					// Pass in REST endpoint to each subtask along with its parent story (the i in storyList[i]).
					queries.push(makeQuery(i, subtasks[subtaskIndex].self));
					//console.log(numSubtasks + " subtasks.");
					//console.log("Parent story: " + storyListElement.key)
				}
			}
		}
	}

	// Run queries in parallel
	async.parallel(queries, function finished() {
		printStoriesAndSubtasks(callback, storyList, outputObject, currentSprint, currentSprintCount);
	});

	console.log("Done collecting tasks");

} // collectSubtasks




// Load the http module to create an http server.
var http = require('http');

var url = require('url');

// Great tutorial on mustache.js + node.js: http://devcrapshoot.com/javascript/nodejs-expressjs-and-mustachejs-template-engine

// Configure our HTTP server to respond with Hello World to all requests.
var server = http.createServer(function(request, response) {
	var currentSprint = "",
		currentSprintCount = 0,
		storyList = [],
		outputObject = [];

	// Intercept pesky favicon request.
	if (request.url === "/favicon.ico") {
		console.log("favicon requested");
		return;
	}

	response.writeHead(200, {
		//"Content-Type": "text/plain"
		"Content-Type": "text/html"
	});

	var url_parts = url.parse(request.url, true);
	var query = url_parts.query;

	currentSprint = "Sprint " + query["sprint"];

	console.log("Query parameters: " + JSON.stringify(query));
	console.log("Current Sprint: " + currentSprint);

	async.series([
			function startQueries(callback) {

				console.log("Start querying " + currentSprint);

				// Other paths that I explored and why they did not work:

				// Not useful for me, because order of tickets with regard to its sprint not maintained. Plus it 
				// appears to return tickets that do not belong in the sprint.
				// path: "/rest/greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=12&sprintId=26" 

				// Not useful, because tickets are returned in descending ticket id's. Also returns tickets that 
				// do not belong in the current sprint.
				// path: "/rest/api/latest/search?jql=sprint%3D26&fields=key&maxResults=50" 

				// For reference, this call returns information about one ticket.
				// path: "/rest/api/2/issue/ULIVE-929"
				var options = {
					host: jiraHost,
					// Only url that returns tickets in the same order as in the sprints.
					path: "/rest/greenhopper/1.0/xboard/plan/backlog/data.json?rapidViewId=12",
					auth: myAuth
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
						var obj = JSON.parse(data).issues;

						for (var i = 0; i < obj.length; i++) {
							//console.log(obj[i].key);

							// Second approach: build out an array of all the tickets first
							storyList[i] = {}; // If I do not intialize this element to an empty object first, applying storyList[i].key throws an error.
							storyList[i].key = obj[i].key;
						}

						//console.log(storyList.length);


						// After a lot of hunting, I finally found an example of a dynamically created array of functions that is passed
						// into async.parallel!
						// Source: http://codereview.stackexchange.com/questions/6101/async-callbacks-and-closures-am-i-doing-it-right
						var queries = []; // this will be fed to async.parallel() later

						var makeQuery = function makeQuery(index) { // factory function to create the queries
							return function doQuery(callback) {
								////console.log(index);

								var options = {
									host: jiraHost,
									path: "/rest/api/2/issue/" + storyList[index].key
									//, path: "/rest/api/2/issue/ULIVE-929"
									//, path: "/rest/api/latest/search?jql=sprint%3D26&fields=key&maxResults=50"
									,
									auth: myAuth
								};

								hitURL3(options, index, function addStory(data) {

									var obj = JSON.parse(data),
										sprintField = (obj.fields && obj.fields.customfield_10311 ? obj.fields.customfield_10311 : null),
										json = "",
										findSprint = currentSprint;
									// Remove stories that do not have sprintField specified or has sprintField specified,
									// but does not belong to findSprint, e.g. "Sprint 13".
									// Once we call hitURL once for every story in the set, we can return the final array.

									if (!sprintField || (sprintField && (sprintField.toString()).indexOf(findSprint) === -1)) {
										//console.log(obj.key);

										// If ticket does not belong to the current sprint, mark it for removal from the story array.
										// If I do this: storyList.splice(index, 1), 
										// I end up changing the size and therefore the indices of the array get messed up!
										storyList[index] = null;

									} else if (sprintField) {
										// This JIRA ticket belongs to the current sprint, yay!
										//console.log("What is index? " + index);
										storyList[index].info = obj;
									}

									callback();

								}, callback);

							};
						};

						for (var j = 0; j < storyList.length; j++) { // build the list of tasks to be done in parallel
							queries.push(makeQuery(j));
						}

						// Run queries in parallel
						async.parallel(queries, function finished() {
							collectSubtasks(callback, storyList, outputObject, currentSprint, currentSprintCount);
						});

						console.log("Done filtering list of " + storyList.length + " (!!!) stories to include only those that belong to " + currentSprint);
					});

				}); // req = https.request

				req.end();

				req.on("error", function(e) {
					console.error(e);
				});

			}
		],

		// Callback from async.series

		function outputData(err, results) {
			// Great tutorial on mustache.js + node.js: http://devcrapshoot.com/javascript/nodejs-expressjs-and-mustachejs-template-engine
			// Wrap the data in a global object... (mustache starts from an object then parses)
			var rData = {
				finalData: outputObject
			};
			var page = fs.readFileSync("index.html", "utf8"); // bring in the HTML file
			var html = mustache.to_html(page, rData); // replace all of the data

			//response.end("Hello World\n");
			response.end(html);

		}); // async.series

}); // server

// Increase socket timeout from default two minutes, JIRA is slow!
// Source: http://nodejs.org/api/all.html#all_server_settimeout_msecs_callback
server.setTimeout(4 * 60 * 1000);

// Listen on port 8000, IP defaults to 127.0.0.1
server.listen(8000);

// Put a friendly message on the terminal
console.log("Server running at http://127.0.0.1:8000/");