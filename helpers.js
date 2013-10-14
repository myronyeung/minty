var https = require("https"),
	async = require("async"),
	fs = require("fs");

/** 
 * Get authentication information from local file (not checked into GitHub). For performance reasons, 
 * this is only called when server starts up, because the JIRA host name and user authentication should 
 * not change too often.
 *
 * Source: http://stackoverflow.com/questions/11375719/read-json-data-into-global-variable-in-node-js
 */
authenticate  = function(callback) {

	fs.readFile("conf/settings.json", "UTF8", function(err, data) {
		if (err) {
			return console.log(err);
		} else {
			var loginInfo = JSON.parse(data),
				options = {};
				options.jiraHost = loginInfo.jiraHost;
				options.myAuth = loginInfo.auth;

			callback(null, options);
		}
	});
} // authenticate


/**
 * Make a single https request.
 *
 */
hitURL = function(options, index, func, callback) {

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

} // hitURL


/**
 * Collect subtasks in parallel
 *
 * IMPORTANT LESSON: After a lot of hunting, I finally found an example of a dynamically created 
 * array of functions that is passed into async.parallel.
 *
 * Source: http://codereview.stackexchange.com/questions/6101/async-callbacks-and-closures-am-i-doing-it-right
 */
 collectSubtasks = function(params) {
	var callback = params.callback,
		sprintObj = params.sprintObj,
		issues = sprintObj.issues,
		queries = [], // this will be fed to async.parallel() later

		makeQuery = function makeQuery(subtasksObject, subtaskURL) { // factory function to create the queries
		return function doQuery(callback) {
			////console.log(index);

			var options = {
				host: params.jiraHost,
				auth: params.myAuth,
				path: subtaskURL
			};

			hitURL(options, null, function addSubtask(data) {

				var obj = JSON.parse(data);

				// Add subtask to subtask summary, which is a child of the subtasks array, which is a child of the parent issue. 
				// I am adding the entire subtask, because I value having all the data for future-proofing over performance. 
				subtasksObject["subtask"] = obj;

				// Add task owner to contributor list.
				sprintObj["contributors"] = sprintObj["contributors"] || [];

				var assignee = subtasksObject["subtask"].fields.assignee,
					name = assignee.name

				if (sprintObj["contributors"].indexOf(name) === -1) {
					sprintObj["contributors"].push(name);
				}

				callback();

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

	// Run queries in parallel
	async.parallel(queries, function finished() {
		formatIssues(params);
	});

	console.log("Done collecting tasks");

} // collectSubtasks


/**
 *
 *
 */
formatIssues = function(params) {
	var callback = params.callback,
		contributors = params.sprintObj.contributors,
		issues = params.sprintObj.issues,
		fields = "",
		displayString = "";

	for (var i = 0; i < issues.length; i++) {
		var issue = issues[i],
			formattedIssue = {};

		fields = issue.fields;

		formattedIssue["key"] = issue.key;
		formattedIssue["type"] = fields.issuetype.name;
		formattedIssue["summary"] = fields.summary;
		formattedIssue["status"] = fields.status.name;
		formattedIssue["release"] = (fields.fixVersions[0] && fields.fixVersions[0].name ? fields.fixVersions[0].name : "");
		formattedIssue["storyPoints"] = (fields.issuetype.name === "Story" ? (fields.customfield_10002 ? parseInt(fields.customfield_10002) : "N/A") : "");

		// Add subtasks if story has them.
		if (issue.subtasks) {
			var subtasks = issue.subtasks,
				numSubtasks = subtasks.length;
			if (numSubtasks > 0) {
				for (var subtaskIndex = 0; subtaskIndex < numSubtasks; subtaskIndex++) {
					var name = subtasks[subtaskIndex].fields.assignee.name,
						displayName = subtasks[subtaskIndex].fields.assignee.displayName,
						remainingEstimateSeconds = subtasks[subtaskIndex].fields.timetracking.remainingEstimateSeconds;

					if (formattedIssue[name]) {
						// There is already one or more tasks for this story/bug assigned to this person, so add more time to this person.
						formattedIssue[name] += (remainingEstimateSeconds / 3600);
					} else {
						formattedIssue[name] = remainingEstimateSeconds / 3600;
					}
				}
			}
		}

		// HACK: Print subtasks for stickies.
		if (issue.subtasks) {
			var subtasks2 = issue.subtasks,
				numSubtasks2 = subtasks2.length;
			if (numSubtasks2 > 0) {

				formattedIssue["subtasks"] = [];
				for (var subtaskIndex2 = 0; subtaskIndex2 < numSubtasks2; subtaskIndex2++) {
					//console.log(subtasks2[subtaskIndex2]);
					formattedIssue["subtasks"][subtaskIndex2] = {};
					formattedIssue["subtasks"][subtaskIndex2]["displayName"] = subtasks2[subtaskIndex2].fields.assignee.displayName;
					formattedIssue["subtasks"][subtaskIndex2]["estimate"] = subtasks2[subtaskIndex2].fields.timetracking.remainingEstimate;
				}
			}
		}

		////
		//;;params.rawCompleteOutput.push(formattedIssue);
		////
	}

	console.log("Done! Number of stories in " + params.currentSprint + ": " + params.currentSprintCount);

	// This tells the app that it is done getting all the data and is ready to pass control over to outputData().
	callback(null, "foo");

} // formatIssues

/*****
	var url_parts = url.parse(request.url, true),
		query = url_parts.query;

	currentSprint = "Sprint " + query["sprint"];

	console.log("Query parameters: " + JSON.stringify(query));
	console.log("Current Sprint: " + currentSprint);

	async.series([
		function collectIssues(callback) {

			console.log("Start querying " + currentSprint);

			// Other paths that I explored and why they did not work:

			// Not useful for me, because order of tickets with regard to its sprint not maintained. Plus it 
			// appears to return tickets that do not belong in the sprint.
			// path: "/rest/greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=12&sprintId=26" 

			// Not useful, because tickets are returned in descending ticket id's. Also returns tickets that 
			// do not belong in the current sprint.
			// path: "/rest/api/latest/search?jql=sprint%3D26&fields=key&maxResults=50" 

			// This is the second best way, but it is hugely inefficient, because as of Sprint 15, it would return ~210 JIRA tickets.
			// I then had to loop through each one to see if custom field customfield_10311 contained the string "Sprint 15". Yowza!
			// path: "/rest/greenhopper/1.0/xboard/plan/backlog/data.json?rapidViewId=12",

			// Best way!

			// Just use JQL! With one call I can get all stories and bugs from a specific sprint and 
			// ordered by rank (rank is how the tickets are hand-ordered in Greenhopper): 
			// sprint = "Sprint 15" and (type = "story" or type = "bug") order by rank asc
			// How to use within the JIRA web app: Go to JIRA > Issues > Search for Issues > Paste it into search box > Hit enter
			// Here is the actual path: /rest/api/2/search?jql=sprint%20%3D%20%22Sprint%2015%22%20and
			//		%20(type%20%3D%20%22story%22%20or%20type%20%3D%20%22bug%22)%20order%20by%20rank%20asc
			//
			// For reference, this call returns information about one ticket.
			// path: "/rest/api/2/issue/JIRA-929"


			// HACK
			var sprintQuery = "/rest/api/2/search?jql=sprint%20%3D%20%22" + 
				currentSprint.replace(/ /g, "%20") + // HACK to convert space to a HTML entity.
				"%22%20and%20(type%20%3D%20%22story%22%20or%20type%20%3D%20%22bug%22)%20order%20by%20rank%20asc";

			var options = {
				host: jiraHost,
				// Only url that returns tickets in the same order as in the sprints.
				path: sprintQuery,
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

					// TODO: rename sprintObj to something more appropriate. Rename obj to sprintItems or issues (or something similar).
					var sprintObj = JSON.parse(data);

					totalIssues = sprintObj.total;

					rawCompleteOutput = sprintObj;

//					console.log("########## rawCompleteOutput after initial call to build list of stories ##########");
//					console.log("%j", rawCompleteOutput);


					collectSubtasks({
						"jiraHost": jiraHost,
						"myAuth": myAuth,
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

		}
	],

	// Callback from async.series. resultsArray stores callback result from each task.
	function outputData(err, resultsArray) {

		// Great tutorial on mustache.js + node.js: http://devcrapshoot.com/javascript/nodejs-expressjs-and-mustachejs-template-engine
		// Wrap the data in a global object... (mustache starts from an object then parses)
		var rData = {
			"finalData": rawCompleteOutput
		};
		var page = fs.readFileSync("index.html", "utf8"), // bring in the HTML file
			html = mustache.to_html(page, rData); // replace all of the data

		// Important debug tool, do not remove this.
		//console.log("########## rawCompleteOutput after call to outputData() ##########");
		//console.log("rawCompleteOutput: %j", rawCompleteOutput);

		response.end(html);

	}); // async.series

*****/


exports.authenticate = authenticate;
exports.hitURL = hitURL;
exports.collectSubtasks = collectSubtasks;
exports.formatIssues = formatIssues;
