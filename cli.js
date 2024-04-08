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
         *      @desc: The path to the configuration file. The default configuration file is located at `/etc/vbackup/config`.
         *  @param:
         *      @name: --daemon
         *      @type: boolean
         *      @desc: Flag to start the service daemon.
         *  @usage: 
         *      @CLI:
         *          $ vbackup --start
         */
        {
            id: "--start",
            description: "Start the server (daemon).",
            examples: {
                "Start": "vbackup --start",
            },
            args: [
                {id: "--config", type: "string", required: false, description: `The path to the configuration file. The default configuration file is located at "/etc/vbackup/config".`},
                {id: "--daemon", type: "boolean", description: `Flag to start the service daemon.`},
            ],
            callback: async ({
                config = "/etc/vbackup/config",
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
         *      @desc: The path to the configuration file. The default configuration file is located at `/etc/vbackup/config`.
         *  @usage: 
         *      @CLI:
         *          $ vbackup --stop
         */
        {
            id: "--stop",
            description: "Stop the server service daemon.",
            examples: {
                "Stop": "vbackup --stop",
            },
            args: [
                {id: "--config", type: "string", required: false, description: `The path to the configuration file. The default configuration file is located at "/etc/vbackup/config".`},
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
         *      @desc: The path to the configuration file. The default configuration file is located at `/etc/vbackup/config`.
         *  @usage: 
         *      @CLI:
         *          $ vbackup --restart
         */
        {
            id: "--restart",
            description: "Restart the server service daemon.",
            examples: {
                "Restart": "vbackup --restart",
            },
            args: [
                {id: "--config", type: "string", required: false, description: `The path to the configuration file. The default configuration file is located at "/etc/vbackup/config".`},
            ],
            callback: async ({
                config = "/etc/vbackup/config",
            }) => {
                const server = Server.from_config(config);
                if (!server.daemon) { cli.throw_error("The server service daemon is disabled. Parameter \"--config\" must be passed to define the path to the configuration file."); }
                await server.daemon.restart()
            }
        },

        /*  @docs:
            @lang: CLI
            @parent: CLI
            @title: List backups
            @name: --list-backups
            @description: List the created backups, optionally per target.
            @param:
                @name: --config
                @type: string
                @desc: The path to the configuration file. The default configuration file is located at `/etc/vbackup/config`.
            @param:
                @name: --target
                @type: null, string
                @desc: The optional target of which to list the backups.
            @usage: 
                @CLI:
                    $ vbackup --list-backups
         */
        {
            id: "--list-backups",
            description: "List the created backups, optionally per target.",
            examples: {
                "List backups": "vbackup --list-backups",
            },
            args: [
                {id: "--config", type: "string", required: false, description: `The path to the configuration file. The default configuration file is located at "/etc/vbackup/config".`},
                {id: "--target", type: "string", required: false, description: `The optional target of which to list the backups.`},
            ],
            callback: async ({
                config = "/etc/vbackup/config",
                target = null,
            }) => {
                const server = Server.from_config(config);
                const backups = await server.list_backups(target);
                let has_backups = false;
                Object.keys(backups).iterate(key => {
                    if (backups[key].length > 0) {
                        has_backups = true;
                        console.log(`${key}:`);
                        backups[key].iterate(item => {
                            console.log(` * ${item}/`);
                        })
                    }
                })
                if (!has_backups) {
                    console.log("No backups are created yet.");
                }
            }
        },

        /*  @docs:
            @lang: CLI
            @parent: CLI
            @title: Restore backup
            @name: --restore-backup
            @description: Restore a backup by target and timestamp.
            @param:
                @name: --config
                @type: string
                @desc: The path to the configuration file. The default configuration file is located at `/etc/vbackup/config`.
            @param:
                @name: --target
                @type: string
                @desc: The target of which to restore a backup.
                @required: true
            @param:
                @name: --timestamp
                @type: string
                @desc: The version timestamp in unix seconds of the backup to restore. This can be obtained using the `--list-backups` command.
                @required: true
            @param:
                @name: --output
                @type: string
                @desc: The output path where the restored backup will be saved to.
                @required: true
            @usage: 
                @CLI:
                    $ vbackup --restore-backup --target mytarget --timestamp 1712573157 --output /tmp/mytarget/
         */
        {
            id: "--restore-backup",
            description: "Restore a backup by target and timestamp.",
            examples: {
                "Restore backup": "vbackup --restore-backup --target mytarget --timestamp 1712573157 --output /tmp/mytarget/",
            },
            args: [
                {id: "--config", type: "string", required: false, description: `The path to the configuration file. The default configuration file is located at "/etc/vbackup/config".`},
                {id: "--target", type: "string", required: true, description: `The target of which to restore a backup.`},
                {id: "--timestamp", type: "string", required: true, description: `The version timestamp in unix seconds of the backup to restore. This can be obtained using the "--list-backups" command.`},
                {id: "--output", type: "string", required: true, description: `The output path where the restored backup will be saved to.`},
            ],
            callback: async ({
                config = "/etc/vbackup/config",
                target = null,
                timestamp = null,
                output = null,
            }) => {
                const server = Server.from_config(config);
                await server.restore_backup(target, timestamp, output);
                console.log(`Successfully restored backup "${target}@${timestamp}" to "${output}".`);
            }
        },

    ],
});

// Start.
cli.start();