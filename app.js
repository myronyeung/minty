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
	, storyListJSON = {}
	, storyList = [];

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
				storyList[i] = obj[i].key;
				storyListJSON[obj[i].key] = obj;
				// First approach (which I abandoned because the results from each call to hitURL came back non-deterministically):
				// Now check each issue and see if it belongs in the current sprint:
				//hitURL(options);
			}

			console.log(storyList.length);

			// Kinda ghetto, imitating this pattern for managing asynchronous calls: http://book.mixu.net/node/ch7.html#block_2
			// Every time hitURL is called, I decrement this counter. When it hits zero, I will call a method that will return the final, groomed 
			// list of stories.
			originalStoryListCounter = storyList.length;

			for(var j = 0; j < storyList.length; j++) { 
				////console.log(storyList[j]);

				var options = {
					host: jiraHost
					, path: "/rest/api/2/issue/" + storyList[j]
					//, path: "/rest/api/2/issue/ULIVE-929"
					//, path: "/rest/api/latest/search?jql=sprint%3D26&fields=key&maxResults=50"
					, auth: myAuth
				};

				hitURL(options);
			}

			console.log("NOT Done!!! Async's will still happen after this line is called!!!");
		});
	});

	req.end();

	req.on("error", function(e) {
		console.error(e);
	});


	var hitURL = function(options) {
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

				// Remove stories that do not have sprintField specified or has sprintField specified, but does not belong to findSprint, e.g. "Sprint 13".
				// Once we call hitURL once for every story in the set, we can return the final array.
				originalStoryListCounter--;
				console.log(originalStoryListCounter);

				if(!sprintField || (sprintField && (sprintField.toString()).indexOf(findSprint) === -1)) {
					//console.log(storyList.length);

					// If ticket does not belong to the current sprint, remove it from the story array
					var i = storyList.indexOf(obj.key);

					if(i !== -1) {
						storyList.splice(i, 1);
						delete storyListJSON[obj.key];
					}

					//console.log(obj.key + ": " + obj.fields.summary + (obj.fields.fixVersions && obj.fields.fixVersions[0] ? ": " + obj.fields.fixVersions[0].name : "" ));
					//console.log(obj.fields.customfield_10311);
				} else {
					////storyListJSON[obj.key] = obj;
				}

				if(originalStoryListCounter === 0) {
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
		console.log("Done! Number of stories in " + CURRENT_SPRINT + ": " + storyList.length);
		for (var key in storyListJSON) {
			if (storyListJSON.hasOwnProperty(key)) {
				var fields = storyListJSON[key].fields;
				//console.log(key + ": " + storyListJSON[key].fields.summary);
				console.log(key + "\t" + fields.summary + /*"\t" + (fields.customfield_10002 ? fields.customfield_10002 : "") + */
					"\t" + (fields.fixVersions && fields.fixVersions[0] && fields.fixVersions[0].name ? fields.fixVersions[0].name : ""));
			}
		}

		
		for(var i = 0; i < storyList.length; i++) {
			console.log(storyList[i]);
		}
		
	}

	/* Code waiting in the wings: */

	// To reduce a name to the first initials (capitalized): Myron Yeung becomes MY.
	//.replace(/\W*(\w)\w*/g, '$1').toUpperCase()



	
});





