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

	async.waterfall([
		// Get current sprint.
		function(callback) {
			var query = parseURL(request.url, true),
				currentSprint = "Sprint " + query["sprint"],
				wipSprintObj = {};

			wipSprintObj.id = currentSprint;

			callback(null, wipSprintObj);
		},
		// Get list of issues in current sprint.
		function(wipSprintObj, callback) {
			var currentSprint = wipSprintObj.id;

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

				// Solution to SyntaxError: Unexpected end of input:
				// Source: http://stackoverflow.com/questions/13212956/node-js-and-json-run-time-error
				res.on("end", function buildEntireList() {

					var sprintObjRaw = JSON.parse(data);

					wipSprintObj.total = sprintObjRaw.total;
					wipSprintObj.issues = sprintObjRaw.issues;

					callback(null, wipSprintObj);

					console.log("There are " + wipSprintObj.total + " issues in " + wipSprintObj.id);
				});

			}); // req = https.request

			req.end();

			req.on("error", function(err) {
				console.error(err);
				callback(err);
			});
		},
		// Collect subtasks for each issue.
		function(wipSprintObj, callback) {

			var jiraHost = authentication.jiraHost,
				myAuth = authentication.myAuth,
				issues = wipSprintObj.issues,
				queries = []; // this will be fed to async.parallel() later

			// Factory function to create the queries.
			makeQuery = function makeQuery(subtasksObject, subtaskURL) {

				return function doQuery(callback) {

					var options = {
						host: jiraHost,
						auth: myAuth,
						path: subtaskURL
					};

					hitURL(options, null, function addSubtask(data) {

						var obj = JSON.parse(data);

						// Add subtask to subtask summary, which is a child of the subtasks array, which is a child of the parent issue. 
						// I am adding the entire subtask, because I value having all the data for future-proofing over performance. 
						subtasksObject["subtask"] = obj;

						// Add task owner to contributor list.
						wipSprintObj["contributors"] = wipSprintObj["contributors"] || [];

						var assignee = subtasksObject["subtask"].fields.assignee,
							name = assignee.name

						if (wipSprintObj["contributors"].indexOf(name) === -1) {
							wipSprintObj["contributors"].push(name);
						}

						callback(null, null);

					}, callback);

				};
			};

			// Build the list of queries to be done in parallel.
			for (var i = 0; i < issues.length; i++) {
				var issue = issues[i];

				//TODO: Is this conditional necessary?
				if (issue) {
					var subtasks = issue.fields.subtasks,
						numSubtasks = subtasks.length;

					if (numSubtasks > 0) {
						for (var subtaskIndex = 0; subtaskIndex < numSubtasks; subtaskIndex++) {
							// First param: Subtask summary, which is a child of the subtasks array, which is a child of the parent issue.
							// Second param: REST endpoint of each subtask.
							queries.push(makeQuery(subtasks[subtaskIndex], subtasks[subtaskIndex].self));
						}
					}
				}
			}

			async.parallel(queries, function(err, results) {
				// Do not need results, which is an array of subtasks, because 
				// I have already appended each subtask to its parent story in 
				// wipSprintObj, which I "rename" to completeSprintObj. This "renaming"
				// is redundant, but I want to make it very obvious that the
				// object representing the sprint has finally reached its end state.
				var completeSprintObj = wipSprintObj;

				//console.log(util.inspect(completeSprintObj, { showHidden: false, depth: null })); // infinite depth

				callback(null, completeSprintObj);
			});

			/*
			collectSubtasks({
				"authentication": authentication,
				"sprintObj": wipSprintObj,
				"callback": callback
			});
			*/
		},
		// CUSTOMIZE DATA OUTPUT HERE:
		// Filter/Format the data. This is where you control what 
		// you want to send to the UI layer.
		function(completeSprintObj, callback) {

			var tableFriendlySprintObj = {};

			// Adding another level named "sprint" makes the data calls in 
			// the template look nicer.
			tableFriendlySprintObj.sprint = {};

			tableFriendlySprintObj.sprint.id = completeSprintObj.id;
			tableFriendlySprintObj.sprint.total = completeSprintObj.total;
			tableFriendlySprintObj.sprint.contributors = completeSprintObj.contributors;

			var formattedIssues = [];
			for (var i = 0; i < completeSprintObj.issues.length; i++) {
				formattedIssues[i] = {};
				formattedIssues[i].key = completeSprintObj.issues[i].key;
				formattedIssues[i].summary = completeSprintObj.issues[i].fields.summary;
				formattedIssues[i].type = completeSprintObj.issues[i].fields.issuetype.name;
				formattedIssues[i].storyPoints = (formattedIssues[i].type === "Story" ? (completeSprintObj.issues[i].fields.customfield_10002 ? parseInt(completeSprintObj.issues[i].fields.customfield_10002) : "TBD") : "");
				formattedIssues[i].status = completeSprintObj.issues[i].fields.status.name;
				
				formattedIssues[i].fixVersions = [];
				for (var x = 0; x < completeSprintObj.issues[i].fields.fixVersions.length; x++) {
					formattedIssues[i].fixVersions[x] = completeSprintObj.issues[i].fields.fixVersions[x].name;
				}

				// Subtasks for tables.
				formattedIssues[i].subtasks = [];
				for (var j = 0; j < completeSprintObj.contributors.length; j++) {
					formattedIssues[i].subtasks[j] = {};
					formattedIssues[i].subtasks[j].name = completeSprintObj.contributors[j];
					formattedIssues[i].subtasks[j].displayName = "COMING SOON!";

					for (var k = 0; k < completeSprintObj.issues[i].fields.subtasks.length; k++) {
						if (completeSprintObj.issues[i].fields.subtasks[k].subtask.fields.assignee.name === formattedIssues[i].subtasks[j].name) {
							if (isNaN(formattedIssues[i].subtasks[j].remainingEstimateHours)) {
								formattedIssues[i].subtasks[j].remainingEstimateHours = completeSprintObj.issues[i].fields.subtasks[k].subtask.fields.timetracking.remainingEstimateSeconds / 3600;
							} else {
								// If contributor has multiple tasks, add them up.
								formattedIssues[i].subtasks[j].remainingEstimateHours += completeSprintObj.issues[i].fields.subtasks[k].subtask.fields.timetracking.remainingEstimateSeconds / 3600;
							}
						}
					}
				}

				// Subtasks for stickies.
				formattedIssues[i].subtasksForStickies = [];

				for (var z = 0; z < completeSprintObj.issues[i].fields.subtasks.length; z++) {
					formattedIssues[i].subtasksForStickies[z] = {};
					if (completeSprintObj.issues[i].fields.subtasks[z].subtask.fields.assignee.name) {
						formattedIssues[i].subtasksForStickies[z].name = completeSprintObj.issues[i].fields.subtasks[z].subtask.fields.assignee.name;
						formattedIssues[i].subtasksForStickies[z].displayName = completeSprintObj.issues[i].fields.subtasks[z].subtask.fields.assignee.displayName;
						if (isNaN(formattedIssues[i].subtasksForStickies[z].remainingEstimateHours)) {
							formattedIssues[i].subtasksForStickies[z].remainingEstimateHours = completeSprintObj.issues[i].fields.subtasks[z].subtask.fields.timetracking.remainingEstimateSeconds / 3600;
						} else {
							// If contributor has multiple tasks, add them up.
							formattedIssues[i].subtasksForStickies[z].remainingEstimateHours += completeSprintObj.issues[i].fields.subtasks[z].subtask.fields.timetracking.remainingEstimateSeconds / 3600;
						}
					}
				}
			}

			tableFriendlySprintObj.sprint.issues = formattedIssues;

			callback(null, tableFriendlySprintObj);
		}
	],	// Render HTML...Finally!
		function(err, tableFriendlySprintObj) {
			console.log("Rendering HTML");
			console.log(util.inspect(tableFriendlySprintObj, { showHidden: false, depth: null })); // infinite depth

			sendToTemplate(response, "index.html", tableFriendlySprintObj);
	});
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
