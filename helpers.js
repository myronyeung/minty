var https = require("https"),
	async = require("async");

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

}


collectSubtasks = function(params) {
	var callback = params.callback;
	var storyList = params.storyList;
	var queries = []; // this will be fed to async.parallel() later

	var makeQuery = function makeQuery(index, subtaskURL) { // factory function to create the queries
		return function doQuery(callback) {
			////console.log(index);

			var options = {
				host: params.jiraHost,
				auth: params.myAuth,
				path: subtaskURL
			};

			hitURL(options, index, function addSubtask(data) {

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
		printStoriesAndSubtasks(params);
	});

	console.log("Done collecting tasks");

}

// Ultimately an element of storyList looks like this for example:
//	storyList[1] = {
//	"key" : "U-929",
//	"info" : { Big JSON object returned from https://perfectsense.atlassian.net/rest/api/2/issue/ULIVE-929 }
//	"subtasks" {[array of subtasks]}
//	}

printStoriesAndSubtasks = function(params) {
	var storyList = params.storyList,
		fields = "",
		displayString = "";

	params.outputObject["sprintContributors"] = []; // Store contributors for the current sprint.

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
						displayString += (subtasks[subtaskIndex].fields.assignee.displayName).replace(/\W*(\w)\w*/g, "$1").toUpperCase() + ": ";
						displayString += subtasks[subtaskIndex].fields.timetracking.originalEstimate + ", ";

						////
						//var displayName = (subtasks[subtaskIndex].fields.assignee.displayName).replace(/\W*(\w)\w*/g, "$1").toUpperCase(),
						var name = subtasks[subtaskIndex].fields.assignee.name,
							displayName = subtasks[subtaskIndex].fields.assignee.displayName,
							remainingEstimateSeconds = subtasks[subtaskIndex].fields.timetracking.remainingEstimateSeconds;

						if (tempOutputObject[name]) {
							// There is already one or more tasks for this story/bug assigned to this person, so add more time to this person.
							tempOutputObject[name] += (remainingEstimateSeconds / 3600);
						} else {
							tempOutputObject[name] = remainingEstimateSeconds / 3600;
						}

						// Add person to list of current sprint contributors.
						if (params.outputObject.sprintContributors.indexOf(name) === -1) {
							params.outputObject.sprintContributors.push(name);
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
						tempOutputObject["subtasks"][subtaskIndex2]["displayName"] = subtasks2[subtaskIndex2].fields.assignee.displayName;
						tempOutputObject["subtasks"][subtaskIndex2]["estimate"] = subtasks2[subtaskIndex2].fields.timetracking.remainingEstimate;
					}
				}
			}

			////
			params.outputObject.push(tempOutputObject);
			////

			//console.log(displayString);

			// Count number of legit stories in out sprint. Remember, storyList contains null references because for some inane reason, 
			// the API does not allow me to return just the stories in a sprint, in the correct order.
			params.currentSprintCount++;
		}
	}

	// Capture current sprint.
	params.outputObject["currentSprint"] = params.currentSprint;

	console.log("Done! Number of stories in " + params.currentSprint + ": " + params.currentSprintCount);

	// This tells the app that it is done getting all the data and is ready to pass control over to outputData().
	params.callback(null, "foo");

} // printStoriesAndSubtasks

exports.hitURL = hitURL;
exports.collectSubtasks = collectSubtasks;
exports.printStoriesAndSubtasks = printStoriesAndSubtasks;
