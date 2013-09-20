// Load the https module to create an https server.
var https = require("https"),
	fs = require("fs"),
	async = require("async"),
	jiraHost = "",
	myAuth = "",
	currentSprint = "Sprint 13",
	storyList = [],
	currentSprintCount = 0;

// 
if (process.argv.length > 2) {
	currentSprint = process.argv[2]; // Second param passed in (node counts as the zero param).
}

// Get private info
// To overcome async issues where jiraHost and myAuth was not getting set to the private information taken from fs.readFile. I wrapped
// the subsequent calls to the JIRA/GreenHopper API in a callback. Hello pyramid of doom!
// Source: http://stackoverflow.com/questions/11375719/read-json-data-into-global-variable-in-node-js

function readConfig(callback) {
	fs.readFile('conf/settings.json', 'UTF8', function(err, data) {
		if (err) {
			return console.log(err);
		}
		callback(data);
	});
}

readConfig(function(data) {
	var newData = JSON.parse(data);
	jiraHost = newData.jiraHost;
	myAuth = newData.auth;





	var options = {
		host: jiraHost,
		path: "/rest/greenhopper/1.0/xboard/plan/backlog/data.json?rapidViewId=12"
		//, path: "/rest/greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=12&sprintId=26"
		//, path: "/rest/api/2/issue/ULIVE-929"
		//, path: "/rest/api/latest/search?jql=sprint%3D26&fields=key&maxResults=50"
		,
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

		// Solution to SyntaxError: Unexpected end of input:
		// Source: http://stackoverflow.com/questions/13212956/node-js-and-json-run-time-error
		res.on("end", function() {
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

					hitURL(options, index, callback);

				};
			};

			for (var j = 0; j < storyList.length; j++) { // build the list of tasks to be done in parallel
				queries.push(makeQuery(j));
			}

			// Run queries in parallel
			async.parallel(queries, function finished() {
				//console.log('done');
				collectSubtasks();
			});

			console.log("Done filtering list to only stories that belong to " + currentSprint);
		});
	});

	req.end();

	req.on("error", function(e) {
		console.error(e);
	});


	var hitURL = function(options, index, callback) {
		var req = https.request(options, function(res) {

			var data = "";

			res.on("data", function(chunk) {
				data += chunk;
				//process.stdout.write(json);
			});

			// Solution to SyntaxError: Unexpected end of input:
			// Source: http://stackoverflow.com/questions/13212956/node-js-and-json-run-time-error
			res.on("end", function() {

				var obj = JSON.parse(data),
					sprintField = obj.fields.customfield_10311,
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

			});
		});

		req.end();

		req.on("error", function(e) {
			console.error(e);
		});
	}

	// Make request to see information on subtask
	var hitURL2 = function(options, index, subtaskURL, callback) {
		//console.log("Subtask URL: " + subtaskURL);

		var req = https.request(options, function(res) {

			var data = "";

			res.on("data", function(chunk) {
				data += chunk;
				//process.stdout.write(json);
			});

			// Solution to SyntaxError: Unexpected end of input:
			// Source: http://stackoverflow.com/questions/13212956/node-js-and-json-run-time-error
			res.on("end", function() {

				var obj = JSON.parse(data);

				// Add subtask to parent story. I am adding the entire subtask, because I want to sacrifice a bit of performance 
				// for flexibility in the future.
				storyList[index].subtasks = storyList[index].subtasks || [];
				storyList[index].subtasks.push(obj);

				callback();

			});
		});

		req.end();

		req.on("error", function(e) {
			console.error(e);
		});
	}

	var collectSubtasks = function() {


		var queries = []; // this will be fed to async.parallel() later

		var makeQuery = function makeQuery(index, subtaskURL) { // factory function to create the queries
			return function doQuery(callback) {
				////console.log(index);

				var options = {
					host: jiraHost,
					path: subtaskURL,
					auth: myAuth
				};

				hitURL2(options, index, subtaskURL, callback);

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
			printStoriesAndSubtasks();
		});

		console.log("Done collecting tasks");
	}

	var printStoriesAndSubtasks = function() {
		var fields = "";
		var displayString = "";

		console.log(currentSprint + "\n");

		for (var i = 0; i < storyList.length; i++) {
			var storyListElement = storyList[i];
			if (storyListElement) {
				fields = storyListElement.info.fields;
				displayString =
					(fields.issuetype.name === "Story" ? "Story Points: " + (fields.customfield_10002 ? parseInt(fields.customfield_10002) : "") : fields.issuetype.name) + "\t" +
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
						}
					}
				}
				console.log(displayString);

				// Count number of legit stories in Sprint. Remember, storyList contains null references because for some inane reason, 
				// the API does not allow me to return just the Stories in a Sprint, in the correct order.
				currentSprintCount++;
			}
		}

		console.log("Done! Number of stories in " + currentSprint + ": " + currentSprintCount);
	}

	/* Ultimately an element of storyList looks like this for example:
	storyList[1] = {
		"key" : "U-929",
		"info" : { Big JSON object returned from https://perfectsense.atlassian.net/rest/api/2/issue/ULIVE-929 }
		"subtasks" {[array of subtasks]}
	}
	*/

	// Load the http module to create an http server.
	var http = require('http');

	// Configure our HTTP server to respond with Hello World to all requests.
	var server = http.createServer(function(request, response) {
		response.writeHead(200, {
			"Content-Type": "text/plain"
		});
		//response.end("Hello World\n");
		response.end((storyList.length).toString());
	});

	// Listen on port 8000, IP defaults to 127.0.0.1
	server.listen(8000);

	// Put a friendly message on the terminal
	console.log("Server running at http://127.0.0.1:8000/");



});