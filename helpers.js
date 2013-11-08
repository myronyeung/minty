var async = require("async"),
	fs = require("fs"),
	https = require("https"),
	mustache = require("mustache"),
	url = require("url"),
	util = require("util");

/** 
 * Get authentication information from local file (not checked into GitHub).
 *
 * Reference:
 * Why: http://ejohn.org/blog/keeping-passwords-in-source-control/
 * How: http://stackoverflow.com/questions/11375719/read-json-data-into-global-variable-in-node-js
 */
authenticate  = function(callback) {

	fs.readFile("conf/settings.json", "UTF8", function(err, data) {
		if (err) {
			return console.log("Error reading JIRA authentication file: " + err);
		} else {
			var loginInfo = JSON.parse(data),
				authentication = {};
				authentication.jiraHost = loginInfo.jiraHost;
				authentication.myAuth = loginInfo.auth;

			callback(null, authentication);
		}
	});

} // authenticate


/**
 * Get URL parameters.
 *
 */
parseURL = function(URL, parseQueryString) {

	return (url.parse(URL, parseQueryString)).query;

} // parseURL


/**
 * Get current sprint from URL.
 *
 */
getCurrentSprint = function(request, callback) {

	var query = parseURL(request.url, true),
		currentSprint = query["sprint"],
		wipSprintObj = {};

	wipSprintObj.id = currentSprint;

	callback(null, wipSprintObj);

} // getCurrentSprint


/**
 * Get list of issues in current sprint.
 *
 * Other paths that I explored and why they did not work:
 *
 * Not useful for me, because order of tickets with regard to its sprint not maintained. Plus it 
 * appears to return tickets that do not belong in the sprint.
 * path: "/rest/greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=12&sprintId=26" 
 *
 * Not useful, because tickets are returned in descending ticket id's. Also returns tickets that 
 * do not belong in the current sprint.
 * path: "/rest/api/latest/search?jql=sprint%3D26&fields=key&maxResults=50" 
 *
 * This is the second best way, but it is hugely inefficient, because as of Sprint 15, it would return ~210 JIRA tickets.
 * I then had to loop through each one to see if custom field customfield_10311 contained the string "Sprint 15". Yowza!
 * path: "/rest/greenhopper/1.0/xboard/plan/backlog/data.json?rapidViewId=12",
 *
 * Best way:
 *
 * Just use JQL! With one call I can get all stories and bugs from a specific sprint and 
 * ordered by rank (rank is how the tickets are hand-ordered in Greenhopper): 
 * sprint = "Sprint 15" and (type = "story" or type = "bug") order by rank asc
 * How to use within the JIRA web app: Go to JIRA > Issues > Search for Issues > Paste it into search box > Hit enter
 *
 * References:
 * https://confluence.atlassian.com/display/JIRA/Advanced+Searching#AdvancedSearching-Type
 * http://perishablepress.com/url-character-codes/
 *
 * Here is an example path: 
 * https://www.atlassian.net/rest/api/2/search?jql=sprint=%22Sprint%2015%22%20and%20issueType%20in%20(Story,%20Bug,%20Improvement,%20Task,%20%22New%20Feature%22,%20Question)%20order%20by%20rank%20asc
 *
 * Here is an example path in a more readable format: 
 * https://www.atlassian.net/rest/api/2/search?jql=sprint="Sprint 15" and issueType in (Story, Bug, Improvement, Task, "New Feature", Question) order by rank asc
 * 
 * For reference, this call returns information about one ticket.
 * path: "/rest/api/2/issue/JIRA-929"
 */
getIssues = function(authentication, wipSprintObj, callback) {

	var currentSprint = wipSprintObj.id;

	var sprintQuery = "/rest/api/2/search?jql=sprint=%22" + 
		currentSprint.replace(/ /g, "%20") + // HACK to convert space to a HTML entity.
		"%22%20and%20issueType%20in%20(Story,%20Bug,%20Improvement,%20Task,%20%22New%20Feature%22,%20Question)%20order%20by%20rank%20asc";

	var options = {
		host: authentication.jiraHost,
		// Only url that returns tickets in the same order as in the sprints.
		path: sprintQuery,
		auth: authentication.myAuth
	};

	// Use this host to construct anchor links for each ticket.
	wipSprintObj.host = authentication.jiraHost;

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

			// DEBUG the list of tickets in the sprint.
			//printToConsole("BEGIN: Issues in sprint", "END: Issues in sprint", wipSprintObj);
		});

	}); // req = https.request

	req.end();

	req.on("error", function(err) {
		console.error(err);
		callback(err);
	});

} // getIssues


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
 * Collect subtasks for each issue in parallel
 *
 * IMPORTANT LESSON: After a lot of hunting, I finally found an example of a dynamically created 
 * array of functions that is passed into async.parallel.
 *
 * Source: http://codereview.stackexchange.com/questions/6101/async-callbacks-and-closures-am-i-doing-it-right
 */
collectSubtasks = function(authentication, wipSprintObj, callback) {

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

		// DEBUG the complete gigantic JSON representation of the sprint.
		//printToConsole("BEGIN: Complete JSON Representation of Sprint", "END: Complete JSON Representation of Sprint", completeSprintObj);

		callback(null, completeSprintObj);
	});

} // collectSubtasks


/**
 * Custom function to include and format only the exact bits of information
 * I need to render my page.
 *
 * TODO: Abstract out core functionality into separate functions for reuse
 */
formatForTable = function(completeSprintObj, callback) {

	var tableFriendlySprintObj = {},
		formattedIssues = [];
		formattedIssue = null;
		issue = null,
		fields = null,
		subtask = null, // Caution: this is used in two different loops.
		subtaskFields = null; // Caution: this is used in two different loops.

	// Adding another level named "sprint" makes the mustache data calls in 
	// the template look nicer.
	tableFriendlySprintObj.sprint = {};

	// Add sprint metadata.
	tableFriendlySprintObj.sprint.id = completeSprintObj.id;
	tableFriendlySprintObj.sprint.total = completeSprintObj.total;
	tableFriendlySprintObj.sprint.contributors = completeSprintObj.contributors;

	// Examine issues.
	for (var i = 0; i < completeSprintObj.issues.length; i++) {
		issue = completeSprintObj.issues[i];
		fields = issue.fields;

		formattedIssue = formattedIssues[i] = {};
		formattedIssue.key = issue.key;
		formattedIssue.summary = fields.summary;
		formattedIssue.type = fields.issuetype.name;
		formattedIssue.storyPoints = (formattedIssue.type === "Story" ? (fields.customfield_10002 ? parseInt(fields.customfield_10002) : "TBD") : "");
		formattedIssue.status = fields.status.name;
		formattedIssue.href = "https://" + completeSprintObj.host + "/browse/" + issue.key;
		
		formattedIssue.fixVersions = [];
		for (var x = 0; x < fields.fixVersions.length; x++) {
			formattedIssue.fixVersions[x] = fields.fixVersions[x].name;
		}

		// Subtasks for tables.
		formattedIssue.subtasks = [];
		for (var j = 0; j < completeSprintObj.contributors.length; j++) {
			subtask = formattedIssue.subtasks[j] = {};
			subtask.name = completeSprintObj.contributors[j];
			subtask.displayName = "COMING SOON!";

			for (var k = 0; k < fields.subtasks.length; k++) {
				subtaskFields = fields.subtasks[k].subtask.fields;
				if (subtaskFields.assignee.name === subtask.name) {

					// Know this: Multiple subtasks per person complicates how to display hours (what if some subtasks are "TBD"?) and subtask link
					// can only go to the last subtask, refer to subtask link creation below.
					// TODO: Clean up this nested if structure.
					if (subtaskFields.timetracking.originalEstimateSeconds) {

						// Subtask hours were added.

						if (isNaN(subtask.remainingEstimateHours)) {
							// Either this is the first subtask belonging to this person or the previous subtasks belonging to this person 
							// were all "TBD" (remember a person can have multiple subtasks)
							subtask.remainingEstimateHours = subtaskFields.timetracking.remainingEstimateSeconds / 3600;
						} else {
							// If contributor has multiple tasks, add them up.
							subtask.remainingEstimateHours += subtaskFields.timetracking.remainingEstimateSeconds / 3600;
						}
					} else {

						// Subtask hours were not added (subtaskFields.timetrack = empty object)

						if (isNaN(subtask.remainingEstimateHours)) {
							subtask.remainingEstimateHours = "TBD";
						}
					}

					// Output subtask status and link for anyone who is assigned a subtask. Use case: Resolved or Closed statuses are styled differently.
					// Problem is that I have conflicting requirements: I want the aggregate total of hours for each person (remember, a person can have 
					// multiple subtasks), but that means that there can only be one subtask hyperlink per person per story.
					// Mustache.js bug? If I have a parent with a child object, and they both have identically named keys, e.g. "status".
					// If the child.status does not exist, it prints parent.status. My hack was to rename subtask.status to subtask.subtaskStatus.
					subtask.subtaskStatus = subtaskFields.status.name; 

					// Handy feature to be able to go straight to subtask in JIRA.
					subtask.subtaskHref = "https://" + completeSprintObj.host + "/browse/" + fields.subtasks[k].subtask.key;
				}
			}
		}

		// Subtasks for stickies.
		formattedIssue.subtasksForStickies = [];

		for (var z = 0; z < fields.subtasks.length; z++) {
			subtask = formattedIssue.subtasksForStickies[z] = {};
			subtaskFields = fields.subtasks[z].subtask.fields;
			if (subtaskFields.assignee.name) {

				subtask.name = subtaskFields.assignee.name;
				subtask.displayName = subtaskFields.assignee.displayName;
				if (isNaN(subtask.remainingEstimateHours)) {
					subtask.remainingEstimateHours = subtaskFields.timetracking.remainingEstimateSeconds / 3600;
				} else {
					// If contributor has multiple tasks, add them up.
					subtask.remainingEstimateHours += subtaskFields.timetracking.remainingEstimateSeconds / 3600;
				}
			}
		}
	}

	tableFriendlySprintObj.sprint.issues = formattedIssues;

	// DEBUG this trimmed down JSON representation of the sprint.
	printToConsole("BEGIN: tableFriendlySprintObj", "END: tableFriendlySprintObj", tableFriendlySprintObj);

	callback(null, tableFriendlySprintObj);

} // formatForTable





/**
 * Custom function to include and format only the exact bits of information
 * I need to render information for release.
 *
 * TODO: Abstract out core functionality into separate functions for reuse.
 */
formatForRelease = function(completeSprintObj, callback) {

	var releaseFriendlySprintObj = {},
		formattedIssues = [];
		formattedIssue = null;
		issue = null,
		fields = null,
		formattedSubtask = null,
		subtask = null,
		subtaskFields = null;

	// Adding another level named "sprint" makes the mustache data calls in 
	// the template look nicer.
	releaseFriendlySprintObj.sprint = {};

	// Add sprint metadata.
	releaseFriendlySprintObj.sprint.id = completeSprintObj.id;
	releaseFriendlySprintObj.sprint.total = completeSprintObj.total;
	releaseFriendlySprintObj.sprint.contributors = completeSprintObj.contributors;

	// Examine issues.
	for (var i = 0; i < completeSprintObj.issues.length; i++) {
		issue = completeSprintObj.issues[i];
		fields = issue.fields;

		formattedIssue = formattedIssues[i] = {};
		formattedIssue.key = issue.key;
		formattedIssue.summary = fields.summary;
		formattedIssue.type = fields.issuetype.name;
		formattedIssue.storyPoints = (formattedIssue.type === "Story" ? (fields.customfield_10002 ? parseInt(fields.customfield_10002) : "TBD") : "");
		formattedIssue.status = fields.status.name;
		formattedIssue.href = "https://" + completeSprintObj.host + "/browse/" + issue.key;
		
		formattedIssue.fixVersions = [];
		for (var x = 0; x < fields.fixVersions.length; x++) {
			formattedIssue.fixVersions[x] = fields.fixVersions[x].name;
		}

		//formattedIssue.subtasks = fields.subtasks;
		formattedIssue.subtasks = [];
		for (var y = 0; y < fields.subtasks.length; y++) {
			subtask = fields.subtasks[y];
			subtaskFields = subtask.fields;
			formattedSubtask = {};
			formattedSubtask.subtaskHref = "https://" + completeSprintObj.host + "/browse/" + subtask.key;
			formattedSubtask.summary = subtaskFields.summary;
			formattedSubtask.status = subtaskFields.status.name;

			formattedIssue.subtasks[y] = formattedSubtask;
		}
	}

	releaseFriendlySprintObj.sprint.issues = formattedIssues;

	// DEBUG this trimmed down JSON representation of the sprint.
	//printToConsole("BEGIN: releaseFriendlySprintObj", "END: releaseFriendlySprintObj", releaseFriendlySprintObj);

	callback(null, releaseFriendlySprintObj);

} // formatForRelease


/**
 * Marry data with template and send it to the client.
 */
sendToTemplate = function(response, template, data) {

	var page = fs.readFileSync(template, "utf8"), // bring in the HTML file
		html = mustache.to_html(page, data); // replace all of the data

	response.writeHead(200, {
		"Content-Type": "text/html"
	});
	response.write(html);
	response.end();

} // sendToTemplate


/**
 * Simple debugging tool
 */
printToConsole = function(beginMsg, endMsg, obj) {
	console.log("\n\n\n");
	console.log("######################################################################");
	console.log("#");
	console.log("# " + beginMsg);
	console.log("#");
	console.log("######################################################################");
	console.log("\n");
	console.log(util.inspect(obj, { showHidden: false, depth: null })); // infinite depth.
	console.log("\n");
	console.log("######################################################################");
	console.log("#");
	console.log("# " + endMsg);
	console.log("#");
	console.log("######################################################################");
	console.log("\n\n\n");
}


/**
 * 
 */
display = function(response, request, authentication, template) {
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
		// Great tutorial on mustache.js + node.js: http://devcrapshoot.com/javascript/nodejs-expressjs-and-mustachejs-template-engine
		function(err, tableFriendlySprintObj) {

			console.log("Rendering HTML with display function");
			//console.log(util.inspect(tableFriendlySprintObj, { showHidden: false, depth: null })); // infinite depth

			sendToTemplate(response, template, tableFriendlySprintObj);

	});
} // display


/**
 * 
 */
display2 = function(response, request, authentication, template) {
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
			formatForRelease(completeSprintObj, callback);
		}

	],	// Render HTML...Finally!
		// Great tutorial on mustache.js + node.js: http://devcrapshoot.com/javascript/nodejs-expressjs-and-mustachejs-template-engine
		function(err, tableFriendlySprintObj) {

			console.log("Rendering HTML with display2");
			//console.log(util.inspect(tableFriendlySprintObj, { showHidden: false, depth: null })); // infinite depth

			sendToTemplate(response, template, tableFriendlySprintObj);

	});
} // display


exports.authenticate = authenticate;
exports.parseURL = parseURL;
exports.getCurrentSprint = getCurrentSprint;
exports.getIssues = getIssues;
exports.hitURL = hitURL;
exports.collectSubtasks = collectSubtasks;
exports.formatForTable = formatForTable;
exports.sendToTemplate = sendToTemplate;
exports.printToConsole = printToConsole;
exports.display = display;
exports.display2 = display2; // TODO: Rename
