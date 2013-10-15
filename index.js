// Lots of help reorganizing my server main, server, router, and request handler 
// files came from The Node Beginner Book.
// Source: http://www.nodebeginner.org/

// index.js defines all the objects (which are functions) inside the handle object.

var async = require("async"),
	authentication = {
		"jiraHost": "MISSING!",
		"myAuth": "MISSING!"
	},
	helpers = require("./helpers"),
	requestHandlers = require("./requestHandlers"),
	router = require("./router"),
	server = require("./server");


async.series([
	function(callback) {
		// For performance reasons, this is only called when server starts up, 
		// because the JIRA host name and user authentication should not change too often.
		authenticate(callback);
	}
],
// Callback
function(err, results) {

	authentication.jiraHost = results[0].jiraHost;
	authentication.myAuth = results[0].myAuth;

	console.log("Authentication: " + authentication.jiraHost + ", " + authentication.myAuth);

	var handle = {};
	handle["/"] = requestHandlers.start;
	handle["/index.html"] = requestHandlers.start;
	handle["/start"] = requestHandlers.start; // TODO: Remove
	handle["/show"] = requestHandlers.show; // TODO: Remove
	handle["/error"] = requestHandlers.error;

	server.start(router.route, handle, authentication);

});
