minty
=====

Resource Planning extension for GreenHopper. Within a sprint, display stories/bugs with task owners and their estimates. Basically make it easier to see who is working on what without additional mouse clicks. Also includes a tool to see how adding/removing stories/bugs will affect team capacity.


Configuration
-------------

Create under minty: conf/settings.json

JSON looks like this:

`{  
    "jiraHost" : host, // "www.atlassian.net",  
    "auth": username:password // "myronyeung:jira123"  
  }`

Sources:  
Why: http://ejohn.org/blog/keeping-passwords-in-source-control/  
How: http://stackoverflow.com/questions/11375719/read-json-data-into-global-variable-in-node-js


Running locally
---------------

Table, stickies, and text views: http://127.0.0.1:8000/index.html?sprint=Sprint 16
Text view for creating release emails: http://127.0.0.1:8000/release.html?sprint=Sprint 16

Miscellaneous
-------------

Originally minty resided in one file: app.js. After I broke it out into separate files (The Node Beginner Book: http://www.nodebeginner.org/), I removed app.js, but only after I emailed myself the final version from Wed October 16, 2013.


