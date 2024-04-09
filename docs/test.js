
// Imports.
const vweb = require(`${process.env.PERSISTANCE}/private/dev/vinc/vweb/js/backend/vweb.js`);
const vlib = require(`${process.env.PERSISTANCE}/private/dev/vinc/vlib/js/vlib.js`);

// Initialize the server.
const server = new vweb.Server({
	port: 10000,
	ip: "127.0.0.1",
    domain: "127.0.0.1:8000",
    source: `${__dirname}/.vweb/`,
    database: false,
    file_watcher: false,
})

// Load file.
server.endpoint({
    method: "GET",
    endpoint: "/",
    data: new vlib.Path(`${__dirname}/index.html`).load_sync(),
    content_type: "text/html",
});

// Add csp.
server.add_csp("img-src", "https://10.0.0.8:8001")
server.add_csp("style-src", "https://10.0.0.8:8001")
server.add_csp("default-src", "https://10.0.0.8:8001")

// Start.
server.start();