#!/usr/bin/env node
/*
 * Author: Daan van den Bergh
 * Copyright: © 2022 - 2023 Daan van den Bergh.
 */

// ---------------------------------------------------------
// Imports.

const {vlib, Server} = require("./vbackup.js")

// ---------------------------------------------------------
// CLI.

// Create the CLI.
/*  @docs:
 *  @lang: CLI
 *  @name: CLI
 *  @title: VBackup CLI
 *  @description: The vbackup CLI.
 *  @usage: 
 *      @CLI:
 *          $ vbackup --start --config /path/to/config.json
 */
const cli = new vlib.CLI({
    name: "vbackup",
    description: `The vbackup cli. The cli must have access to a json configuration file. The path to this configuration file can be passed using parameter "--config".`,
    version: "1.1.1",
    commands: [

        // Start.
        /*  @docs:
         *  @lang: CLI
         *  @parent: CLI
         *  @title: Start
         *  @name: --start
         *  @description: Start the server.
         *  @param:
         *      @name: --config
         *      @type: string
         *      @desc: The path to the configuration file.
         *      @con_required: true
         *  @param:
         *      @name: --daemon
         *      @type: boolean
         *      @desc: Flag to start the service daemon.
         *      @con_required: true
         *  @usage: 
         *      @CLI:
         *          $ vbackup --start --config path/to/my/config.js
         */
        {
            id: "--start",
            description: "Start the server (daemon).",
            examples: {
                "Start": "vbackup --start --config path/to/my/config.js",
            },
            args: [
                {id: "--config", type: "string", description: `The path to the configuration file.`},
                {id: "--daemon", type: "boolean", description: `Flag to start the service daemon.`},
            ],
            callback: async ({
                config = null,
                daemon = false,
            }) => {
                const server = Server.from_config(config);

                // Service daemon.
                if (daemon) {
                    if (!server.daemon) { cli.throw_error("The server service daemon is disabled. Parameter \"--config\" must be passed to define the path to the configuration file."); }
                    await server.daemon.stop()
                    if (server.daemon.exists()) {
                        await server.daemon.update()
                    } else {
                        await server.daemon.create()
                    }
                    await server.daemon.start()
                }

                // Development server.
                else {
                    server.start();
                }
            }
        },

        // Stop.
        /*  @docs:
         *  @lang: CLI
         *  @parent: CLI
         *  @title: Stop
         *  @name: --stop
         *  @description: Stop the server service daemon.
         *  @param:
         *      @name: --config
         *      @type: string
         *      @desc: The path to the configuration file.
         *      @con_required: true
         *  @usage: 
         *      @CLI:
         *          $ vbackup --stop --config path/to/my/config.js
         */
        {
            id: "--stop",
            description: "Stop the server service daemon.",
            examples: {
                "Stop": "vbackup --stop --config path/to/my/config.json",
            },
            args: [
                {id: "--config", type: "string", description: `The path to the configuration file.`},
            ],
            callback: async ({
                config = null,
            }) => {
                const server = Server.from_config(config);
                if (!server.daemon) { cli.throw_error("The server service daemon is disabled. Parameter \"--config\" must be passed to define the path to the configuration file."); }
                await server.daemon.stop()
            }
        },

        // Restart.
        /*  @docs:
         *  @lang: CLI
         *  @parent: CLI
         *  @title: Restart
         *  @name: --stop
         *  @description: Restart the server service daemon.
         *  @param:
         *      @name: --config
         *      @type: string
         *      @desc: The path to the configuration file.
         *      @con_required: true
         *  @usage: 
         *      @CLI:
         *          $ vbackup --restart --config path/to/my/config.js
         */
        {
            id: "--restart",
            description: "Restart the server service daemon.",
            examples: {
                "Restart": "vbackup --restart --config path/to/my/config.json",
            },
            args: [
                {id: "--config", type: "string", description: `The path to the configuration file.`},
            ],
            callback: async ({
                config = null,
            }) => {
                const server = Server.from_config(config);
                if (!server.daemon) { cli.throw_error("The server service daemon is disabled. Parameter \"--config\" must be passed to define the path to the configuration file."); }
                await server.daemon.restart()
            }
        },

    ],
});

// Start.
cli.start();