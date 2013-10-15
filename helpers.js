var async = require("async"),
	fs = require("fs"),
	https = require("https"),
	mustache = require("mustache"),
	url = require("url");

/** 
 * Get authentication information from local file (not checked into GitHub).
 *
 * Source: http://stackoverflow.com/questions/11375719/read-json-data-into-global-variable-in-node-js
 */
authenticate  = function(callback) {

	fs.readFile("conf/settings.json", "UTF8", function(err, data) {
		if (err) {
			return console.log(err);
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

}


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

	// This tells the app that it is done getting all the data and is ready to pass control 
	// over to outputData() with formattedIssue as the "return" item.
	callback(null, formattedIssue);

} // formatIssues

sendToTemplate = function(response, template, data) {

	var page = fs.readFileSync(template, "utf8"), // bring in the HTML file
		html = mustache.to_html(page, data); // replace all of the data

	response.writeHead(200, {
		"Content-Type": "text/html"
	});
	response.write(html);
	response.end();

} // sendToTemplate

exports.authenticate = authenticate;
exports.parseURL = parseURL;
exports.hitURL = hitURL;
exports.collectSubtasks = collectSubtasks;
exports.formatIssues = formatIssues;
exports.sendToTemplate = sendToTemplate;
