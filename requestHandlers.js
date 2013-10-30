/*
 *
 */
function displayAll(response, request, authentication) {

	console.log("Request handler 'displayAll' was called.");

	display(response, request, authentication, "index.html");

} // displayAll


/*
 *
 */
function displayRelease(response, request, authentication) {

	console.log("Request handler 'displayRelease' was called.");

	display2(response, request, authentication, "release.html");

} // displayAll


/*
 *
 */
function error(response) {

	console.log("No request handler found, aka page not found.");

	response.writeHead(404, {
		"Content-Type": "text/html"
	});
	response.write("<h2>404 Not found</h2>");
	response.write("<p>Please check your path again.</p>");

	response.end();

} // error


//exports.start = start;
exports.displayAll = displayAll;
exports.displayRelease = displayRelease;
exports.error = error;
