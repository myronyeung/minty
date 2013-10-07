var http = require("http"),
	https = require("https"),
	url = require("url"),
	fs = require("fs"),
	async = require("async"),
	sys = require("sys"),
	mustache = require("mustache"),
	helpers = require("./helpers"),
	jiraHost = "",
	myAuth = "",
	peopleArray = [];

// Get authentication information from local file (not checked into GitHub). For performance reasons, 
// this is only called when server starts up, because the JIRA host name and user authentication should 
// not change too often.
// Source: http://stackoverflow.com/questions/11375719/read-json-data-into-global-variable-in-node-js
(function authenticate() {

	fs.readFile("conf/settings.json", "UTF8", function(err, data) {
		if (err) {
			return console.log(err);
		} else {
			var loginInfo = JSON.parse(data);
			jiraHost = loginInfo.jiraHost;
			myAuth = loginInfo.auth;	
			peopleArray = loginInfo.people
		}
	});
}());

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

			// This is the second best way, but it is hugely inefficient, because as of Sprint 15, it would return ~210 JIRA tickets.
			// I then had to loop through each one to see if custom field customfield_10311 contained the string "Sprint 15". Yowza!
			// path: "/rest/greenhopper/1.0/xboard/plan/backlog/data.json?rapidViewId=12",

			// Best way! Just use JQL! With one call I can get all stories and bugs from a specific sprint and 
			// ordered by rank (rank is how the tickets are hand-ordered in Greenhopper): 
			// sprint = "Sprint 15" and (type = "story" or type = "bug") order by rank asc
			// How to use within the JIRA web app: Go to JIRA > Issues > Search for Issues > Paste it into search box > Hit enter
			// Here is the actual link: https://perfectsense.atlassian.net/rest/api/2/search?jql=sprint%20%3D%20%22Sprint%2015%22%20and
			//		%20(type%20%3D%20%22story%22%20or%20type%20%3D%20%22bug%22)%20order%20by%20rank%20asc
			//
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

					for (var i = 0; i < obj.length-150; i++) {
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

							hitURL(options, index, function addStory(data) {

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
						collectSubtasks({
							"jiraHost": jiraHost,
							"myAuth": myAuth,
							"callback": callback, 
							"storyList": storyList, 
							"outputObject": outputObject, 
							"currentSprint": currentSprint, 
							"currentSprintCount": currentSprintCount
						});
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
			"finalData": outputObject,
			"people": {
				"people": peopleArray,
				"fullName": function() {
					return this.firstName + " " + this.lastName;
				},
				"fullNameCompact": function() {
					return this.firstName + this.lastName;
				}
			}
		};
		var page = fs.readFileSync("index.html", "utf8"); // bring in the HTML file
		var html = mustache.to_html(page, rData); // replace all of the data

		//response.end("Hello World\n");
		response.end(html);

	}); // async.series

}); // server

// Increase socket timeout from default four minutes, JIRA is slow!
// Source: http://nodejs.org/api/all.html#all_server_settimeout_msecs_callback
server.setTimeout(4 * 60 * 1000);

// Listen on port 8000, IP defaults to 127.0.0.1
server.listen(8000);

// Put a friendly message on the terminal
console.log("Minty running at http://127.0.0.1:8000/");