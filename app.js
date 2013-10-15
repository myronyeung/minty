var async = require("async"),
	fs = require("fs"),
	helpers = require("./helpers"),
	http = require("http"),
	https = require("https"),
	jiraHost = "",
	myAuth = "",
	mustache = require("mustache"),
	sys = require("sys"),
	url = require("url");

/** 
 * Get authentication information from local file (not checked into GitHub). For performance reasons, 
 * this is only called when server starts up, because the JIRA host name and user authentication should 
 * not change too often.
 *
 * Sources:
 * Why: http://ejohn.org/blog/keeping-passwords-in-source-control/
 * How: http://stackoverflow.com/questions/11375719/read-json-data-into-global-variable-in-node-js
 */
(function authenticate() {

	fs.readFile("conf/settings.json", "UTF8", function(err, data) {
		if (err) {
			return console.log(err);
		} else {
			var loginInfo = JSON.parse(data);
			jiraHost = loginInfo.jiraHost;
			myAuth = loginInfo.auth;
		}
	});
}()); 


/**
 * Configure our HTTP server to respond with Hello World to all requests.
 *
 * Great tutorial on mustache.js + node.js: http://devcrapshoot.com/javascript/nodejs-expressjs-and-mustachejs-template-engine
 */
var server = http.createServer(function(request, response) {
	var currentSprint = "",
		totalIssues = 0,
		rawCompleteOutput = {};

	// Intercept pesky favicon requests.
	if (request.url === "/favicon.ico") {
		console.log("favicon requested");
		return;
	}

	response.writeHead(200, {
		//"Content-Type": "text/plain"
		"Content-Type": "text/html"
	});

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

}); // server

// Increase socket timeout from default four minutes, JIRA is slow!
// Source: http://nodejs.org/api/all.html#all_server_settimeout_msecs_callback
server.setTimeout(4 * 60 * 1000);

// Listen on port 8000, IP defaults to 127.0.0.1
server.listen(8000);

// Put a friendly message on the terminal
console.log("Minty running at http://127.0.0.1:8000/");
