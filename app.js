// Load the https module to create an https server.
var https = require('https')
	, fs = require('fs')
	, jiraHost = "" //perfectsense.atlassian.net"
	, myAuth = "" //myeung:eBay.c0m"
	, CURRENT_SPRINT = "Sprint 13"
	// Kinda ghetto, imitating this pattern for managing asynchronous calls: http://book.mixu.net/node/ch7.html#block_2
	// Every time hitURL is called, I decrement this counter. When it hits zero, I will call a method that will return the final, groomed 
	// list of stories.
	, originalStoryListCounter = 0
	, storyList = []
	, currentSprintCount = 0;

// Get private info
// To overcome async issues where jiraHost and myAuth was not getting set to the private information taken from fs.readFile. I wrapped
// the subsequent calls to the JIRA/GreenHopper API in a callback. Hello pyramid of doom!
// Source: http://stackoverflow.com/questions/11375719/read-json-data-into-global-variable-in-node-js
function readConfig(callback) { 
	fs.readFile('conf/settings.json', 'UTF8', function (err, data) {
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
		host: jiraHost
		, path: "/rest/greenhopper/1.0/xboard/plan/backlog/data.json?rapidViewId=12"
		//, path: "/rest/greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=12&sprintId=26"
		//, path: "/rest/api/2/issue/ULIVE-929"
		//, path: "/rest/api/latest/search?jql=sprint%3D26&fields=key&maxResults=50"
		, auth: myAuth
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
		res.on("end", function(){
			var obj = JSON.parse(data).issues;

			for(var i = 0; i < obj.length; i++) {
				//console.log(obj[i].key);

				// Second approach: build out an array of all the tickets first
				storyList[i] = {}; // If I do not intialize this element to an empty object first, applying storyList[i].key throws an error.
				storyList[i].key = obj[i].key;
			}

			//console.log(storyList.length);

			// Kinda ghetto, imitating this pattern for managing asynchronous calls: http://book.mixu.net/node/ch7.html#block_2
			// Every time hitURL is called, I decrement this counter. When it hits zero, I will call a method that will return the final, groomed 
			// list of stories.
			originalStoryListCounter = storyList.length;

			for(var j = 0; j < storyList.length; j++) { 
				//console.log(storyList[j]);

				var options = {
					host: jiraHost
					, path: "/rest/api/2/issue/" + storyList[j].key
					//, path: "/rest/api/2/issue/ULIVE-929"
					//, path: "/rest/api/latest/search?jql=sprint%3D26&fields=key&maxResults=50"
					, auth: myAuth
				};

				hitURL(options, j);
			}

			//console.log("NOT Done!!! Async's will still happen after this line is called!!!");
		});
	});

	req.end();

	req.on("error", function(e) {
		console.error(e);
	});


	var hitURL = function(options, index) {
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
				var obj = JSON.parse(data)
					, sprintField = obj.fields.customfield_10311
					, json = ""
					, findSprint = CURRENT_SPRINT;

				// Remove stories that do not have sprintField specified or has sprintField specified,
				// but does not belong to findSprint, e.g. "Sprint 13".
				// Once we call hitURL once for every story in the set, we can return the final array.
				originalStoryListCounter--;
				//console.log(originalStoryListCounter);

				if (!sprintField || (sprintField && (sprintField.toString()).indexOf(findSprint) === -1)) {
					//console.log(obj.key);

					// If ticket does not belong to the current sprint, mark it for removal from the story array.
					// If I do this: storyList.splice(index, 1), 
					// I end up changing the size and therefore the indices of the array get messed up!
					storyList[index] = null;

				} else if (sprintField) {
					// This JIRA ticket belongs to the current sprint, yay!
					storyList[index].info = obj;
				}

				if (originalStoryListCounter === 0) {
					final();
				}
			});
		});

		req.end();

		req.on("error", function(e) {
			console.error(e);
		});
	}

	var final = function() {
		var fields = "";
		var displayString = "";

		for (var i = 0; i < storyList.length; i++) {
			if (storyList[i]) {
				fields = storyList[i].info.fields;
				displayString = fields.issuetype.name + "\t" + 
					storyList[i].key + "\t" + 
					fields.summary + "\t" + 
					(fields.customfield_10002 ? parseInt(fields.customfield_10002) : "") + "\t" + // Story points
					fields.status.name + "\t" + 
					(fields.fixVersions[0] && fields.fixVersions[0].name ? fields.fixVersions[0].name : "") + "\t";
					//storyList[i].info.fields.subtasks[n].self
				console.log(displayString);
				currentSprintCount++;
			}
		}
		
		console.log("Done! Number of stories in " + CURRENT_SPRINT + ": " + currentSprintCount);
	}

	/* Ultimately an element of storyList looks like this for example:
	storyList[1] = {
		"key" : "U-929",
		"info" : { Big JSON object returned from https://perfectsense.atlassian.net/rest/api/2/issue/ULIVE-929 }
	}
	*/

	/* Code waiting in the wings: */

	// To reduce a name to the first initials (capitalized): Myron Yeung becomes MY.
	//.replace(/\W*(\w)\w*/g, '$1').toUpperCase()



	
});





