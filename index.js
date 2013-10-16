// Lots of help reorganizing my server main, server, router, and request handler 
// files came from The Node Beginner Book.
// Reference: http://www.nodebeginner.org/

// index.js defines all the objects (which are functions) inside the handle object.

var async = require("async"),
	helpers = require("./helpers"),
	requestHandlers = require("./requestHandlers"),
	router = require("./router"),
	server = require("./server");

// In this case, async.waterfall makes more sense than async.series, because
// I only want to pass a single object to the callback, not an array of objects.
// Reference: https://github.com/caolan/async#waterfall
async.waterfall([
	function(callback) {
		// For performance reasons, this is only called when server starts up, 
		// because the JIRA host name and user authentication should not change too often.
		authenticate(callback);
	}
],
// Callback
function(err, result) {

	authentication = result;

	console.log("Authentication.jiraHost: " + authentication.jiraHost);

	var handle = {};
	handle["/"] = requestHandlers.start;
	handle["/index.html"] = requestHandlers.start;
	handle["/error"] = requestHandlers.error;

	server.start(router.route, handle, authentication);

});
