/*
 * Author: Daan van den Bergh
 * Copyright: © 2022 - 2023 Daan van den Bergh.
 */

// ---------------------------------------------------------
// Server.

vbackup.FullDiskError = class FullDiskError extends Error {
	constructor(...args) {
		super(...args);
	}
}

// ---------------------------------------------------------
// Server.
// @todo should still test if `$ du -sk . | awk '{print $1 / 1024}'` is accurate and works on linux.

/*	@docs:
	@title: Server
	@desc: 
		The synchronizer class, running on the backup server contacting the main server over ssh.

		The synchronizer keeps full snapshots of older backups every time a backup is created. When free disk space is required the oldest snapshots are automatically removed.
	@warning:
		The ssh key must be added to ssh agent, otherwise it might cause a ssh prompt hang.
	@warning:
		The script should not be executed as user `root` otherwise the incremental backups may not work correctly.
	@param:
		@name: name
		@desc: The name of your backup server for the service daemon.
		@type: string
	@param:
		@name: ip
		@desc: The remote target ip.
		@type: string
	@param:
		@name: port
		@desc: The remote target port.
		@type: number
	@param:
		@name: user
		@desc: The user of the target remote.
		@type: string
	@param:
		@name: key
		@desc: The path to the private SSH key. The SSH key must already be added to the ssh agent, otherwise it might cause a password prompt hang.
		@type: string
	@param:
		@name: destination
		@descr: The path of the backup directory.
		@type: string
	@param:
		@name: targets
		@desc: The path to the private ssh key.
		@type: TargetObject[]
		@attributes_type: TargetObject
		@attr:
			@name: source
			@descr: The source path of the remote target.
			@type: string
		@attr:
			@name: interval
			@descr: The update interval.
			@type: string
			@default: "day"
			@enum:
				@value: "minute"
			@enum:
				@value: "hour"
			@enum:
				@value: "day"
			@enum:
				@value: "week"
			@enum:
				@value: "month"
			@enum:
				@value: "year"
		@attr:
			@name: frequency
			@descr: The update interval frequency.
			@type: number
			@default: 1
		@attr:
			@name: exclude
			@descr: Sub paths to exclude.
			@type: string[]
			@default: []
		@attr:
			@name: delete
			@descr: Remove the deleted files.
			@type: boolean
			@default: true
		@attr:
			@name: directory
			@descr: The target and source paths are directories.
			@type: boolean
			@default: true
	@param:
		@name: auto_remove
		@descr:
			Automatically remove old backups till enough space is freed to back up new targets.

			However, this is not enabled by default because of two reasons.
			<step>
				This will remove all backups until there is enough free space to continue.
				Which could result in the removal of all backups if an (extremely) large new backup needs to be created.
			</step>
			<step>
				The disk space that should be freed is not accurately calculated due to hard links.
				Therefore, the algorithm uses the full size of the remote target for the bytes that should be available on the backup disk.
				However, in reality the files that have not changed will not take up any disk space due to the created hard links.
			</step>
		@warning: This will remove all backups until there is enough free space to continue.
		@type: boolean
		@def: false
	@param:
		@name: log_level
		@descr: The log level.
		@type: number
	@param:
		@name: log_path
		@desc: The path to a log file for the service daemon.
		@type: string
	@param:
		@name: error_path
		@desc: The path to a log file for the service daemon.
		@type: string
	@param:
		@name: _config_path
		@ignore: true
*/
vbackup.Server = class Server {
	constructor({
		name = "vbackup",
		ip,
		port = 22,
		user,
		key,
		destination,
		targets,
		target_source_may_exist = false,
		auto_remove = false,
		log_level = 1,
		log_path = null,
		error_path = null,
		_config_path = null,
	}) {
		
		// Verify args.
        vlib.utils.verify_params({params: arguments[0], check_unknown: true, info: {
        	name: {type: "string", default: "vbackup"},
            ip: "string",
            port: {type: "number", default: 22},
            user: "string",
            key: "string",
            destination: "string",
            targets: "array",
            target_source_may_exist: {type: "boolean", default: false},
            auto_remove: {type: "boolean", default: false},
            log_level: {type: "number", default: 1},
            log_path: {type: "string", default: null},
            error_path: {type: "string", default: null},
            _config_path: {type: "string", default: null},
        }});

        // Attributes.
        this.ip = ip;
        this.port = port;
        this.user = user;
        this.key = key;
        this.destination = new vlib.Path(destination);
        this.auto_remove = auto_remove;

        // Initialize logger.
        this.logger = new vlib.Logger({
        	log_level,
        })

        // Initialize targets.
        const names = [];
        this.targets = targets.iterate_append((target) => {
        	if (target != null && typeof target === "object") {
        		if (typeof target.source !== "string") {
        			throw new Error("Invalid source item, attribute \"source\" must be defined.");
        		}
        		if (!target_source_may_exist && new vlib.Path(target.source).exists()) {
        			throw new Error(`The target remote source "${target.source}" also exists on the local host, this attribute path is meant for the source path on the remote server. If that is indeed the case, define parameter "Server.target_source_may_exist" as "true".`);
        		}
        		if (typeof target.name !== "string") {
        			target.name = new vlib.Path(target.source).name();
        		}
    			if (names.includes(target.name)) {
        			throw new Error(`Another target source already has the same name as defined name "${target.name}", define a unique name through attribute "name".`);
        		}
        		names.append(target.name)
        		if (typeof target.interval !== "string") {
        			target.interval = "day";
        			this.logger.log(1, `Defining default backup interval "day" for target "${target.source}".`)
        		}
        		if (typeof target.frequency !== "number") {
        			target.frequency = 1;
        			this.logger.log(1, `Defining default backup frequency "1" for target "${target.source}".`)
        		}
        		if (typeof target.directory !== "boolean") {
        			target.directory = true;
        		}
        		if (typeof target.delete !== "boolean") {
        			target.delete = true;
        		}
        		while (target.source.last() === "/") {
        			target.source = target.source.substr(0, target.source.length - 1);
        		}
        		if (target.directory) {
        			target.source += "/";
        		}
        		if (!Array.isArray(target.exclude)) {
        			target.exclude = [];
        		}
        		switch (target.interval) {
					case "minute":
						target.update_ms = 60 * target.frequency * 1000;
						target.timestamp_start = "minute_start";
						break;
					case "hour":
						target.update_ms = 3600 * target.frequency * 1000;
						target.timestamp_start = "hour_start";
						break;
					case "day":
						target.update_ms = 3600 * 24 * target.frequency * 1000;
						target.timestamp_start = "day_start";
						break;
					case "week":
						target.update_ms = 3600 * 24 * 7 * target.frequency * 1000;
						target.timestamp_start = "week_start";
						break;
					case "month":
						target.update_ms = 3600 * 24 * 30.5 * target.frequency * 1000;
						target.timestamp_start = "month_start";
						break;
					case "year":
						target.update_ms = 3600 * 24 * 365 * target.frequency * 1000;
						target.timestamp_start = "year_start";
						break;
					default:
						throw new Error(`Invalid value for parameter "interval", the valid values are "minute", "hour", "day", "week", "month" or "year".`);
				}
				target.destination = this.destination.join(target.name);
				if (!target.destination.exists()) {
					target.destination.mkdir_sync();
				}
        		return target;
        	} else {
        		throw new Error("Invalid target item type for parameter \"targets\", the valid type is \"array\" or \"object\".");
        	}
        });

        // Service daemon.
        if (_config_path) {
	        this.daemon = new vlib.Daemon({
	            name: name,
	            // user: libos.userInfo().username,
	            user: "root", // in order to delete some dir such as .Trashes root permission is required.
	            group: "root",
	            command: "vbackup",
	            args: ["--start", "--config", _config_path.toString()],
	            env: {},
	            description: `Service daemon for backup server ${name}.`,
	            auto_restart: true,
	            logs: log_path instanceof vlib.Path ? log_path.str() : log_path,
	            errors: error_path instanceof vlib.Path ? error_path.str() : error_path,
	        })
	    }


        // Prefer /usr/local/bin/rsync over default /usr/bin/rsync, on macos the local is updated through homebrew.
        if (new vlib.Path("/usr/local/bin/rsync").exists()) {
        	this.rsync_bin = "/usr/local/bin/rsync";
        } else {
        	this.rsync_bin = "rsync";
        }
	}

	// Construct from json file.
	/*	@docs:
		@title: From Config
		@descr: Initialize the Server class from a configuration path or object.
		@param:
			@name: path_or_config
			@descr: The path to the configuration file or the configuration object.
			@type: string, object
	 */
	static from_config(path_or_config) {
		if (typeof path_or_config === "string" || path_or_config instanceof vlib.Path) {
			path_or_config = new vlib.Path(path_or_config);
			if (!path_or_config.exists()) {
				throw new Error(`Path "${path_or_config.str()}" does not exist.`);
			}
			const config = JSON.parse(path_or_config.load_sync());
			config._config_path = path_or_config.str();
			path_or_config = config;
		} else if (path_or_config == null || typeof path_or_config !== "object") {
			throw new Error(`Invalid type for parameter "path", the valid types are "string" or "object"`);
		}
		return new vbackup.Server(path_or_config);
	}

	// Start the synchronizer.
	/*	@docs:
		@title: Start
		@descr: Start the server.
	 */
	async start() {
		this.logger.log(0, "Starting backup server.")

		// Initialize process.
		this.proc = new vlib.Proc();

		// Scan.
		this.run_permission = true;
		while (this.run_permission) {
			await this._scan();
		}
	}

	// Restore a backup from a certain timestamp.
	/*  @docs:
        @title: Restore backup
        @description: Restore a backup by target and timestamp.
        @param:
            @name: target
            @type: string
            @desc: The target of which to restore a backup.
            @required: true
        @param:
            @name: timestamp
            @type: string, number
            @desc: The version timestamp in unix seconds of the backup to restore. This can be obtained using the `--list-backups` command.
            @required: true
        @param:
            @name: output
            @type: string
            @desc:
            	The output path where the restored backup will be saved to.

            	When undefined no data will be restored but the path of the target backup will be returned.
        @return:
        	When parameter `output` is defined the backup will be copied to the output path and the output path will be returned.
        	
        	When parameter `output` is undefined no data will be restored but the path of the target backup will be returned.
     */
	async restore_backup(target, timestamp, output = null) {

		// Convert timestamp.
		if (typeof timestamp !== "number") {
			const og = timestamp;
			timestamp = parseInt(timestamp);
			if (isNaN(timestamp)) {
				throw new Error(`Invalid timestamp "${og}", the timestamp must be the unix timestamp in seconds.`);
			}
		}

		// Fetch target.
		target = this.fetch_target(target);

		// Check output.
		if (output != null) {
			output = new vlib.Path(output);
			if (output.exists()) {
				throw new Error(`Output path "${output.str()}" already exists.`);
			}
		}

		// Fetch versions.
		const versions = await this._fetch_target_versions(target);
		const index = versions.indexOf(timestamp);
		if (index === -1) {
			throw new Error(`Unable to find target backup with timestamp "${target.name}@${timestamp}".`);
		}

		// Copy.
		const path = target.destination.join(timestamp.toString());
		if (output == null) {
			return path;
		}
		await path.cp(output);
		return output;
	}

	// Restore a backup from a certain timestamp.
	/*  @docs:
        @title: List backups
        @description: List the created backups, optionally per target.
        @param:
            @name: target
            @type: null, string
            @desc: The optional target of which to list the backups.
        @return:
        	@descr: This function returns an object with target name's as properties and version numbers as values.
        	@code:
        		{
					mytarget: [1712573157],
        		}
     */
	async list_backups(target = null) {
		let backups = {};
		const targets = target == null ? this.targets : [this.fetch_target(target)];
		await this.targets.iterate_async_await(async (target) => {
			backups[target.name] = [];
			const versions = await this._fetch_target_versions(target);
			versions.iterate(version => {
				backups[target.name].append(target.destination.join(version));
			})
			
		})
		return backups;
	}

	/*  @docs:
        @title: Fetch target
        @description: Fetch a target by name.
        @param:
            @name: target
            @type: string
            @desc: The name of the target to fetch.
        @return:
        	This function returns the found target object.
        	When the target does not exist, an error will be thrown.
     */
	fetch_target(target) {
		if (typeof target === "string") {
			const name = target;
			target = this.targets.iterate(target => {
				if (target.name === target) {
					return target;
				}
			})
		}
		if (target == null || typeof target !== "object" || Array.isArray(target)) {
			throw new Error(`Unable to find target "${name}".`);
		}
		return target;
	}

	// ---------------------------------------------------------
	// Utils.

	// Fetch size of a target.
	async _fetch_remote_size(target) {
		this.logger.log(1, `Retrieving remote size of target "${target.name}".`);

		// const args = [
		// 	"-p", this.port,
		// 	"-i", this.key,
		// 	"-o", "StrictHostKeyChecking=no",
		// 	`${this.user}@${this.ip}`,
		// 	```'calculate_directory_size() {
		// 	    local directory="$1"
		// 	    local total_size=0
		// 	    for item in "$directory"/*; do
		// 	        if [[ -f "$item" ]]; then
		// 	            total_size=$((total_size + $(stat -f "%z" "$item")))
		// 	        elif [[ -d "$item" ]]; then
		// 	            total_size=$((total_size + $(calculate_directory_size "$item")))
		// 	        fi
		// 	    done
		// 	    echo "$total_size"
		// 	}
		// 	calculate_directory_size ${target.source}'
		// 	```
		// ];
		// const exit_status = await this.proc.start({command: "ssh", args});
		// if (exit_status != 0) {
		// 	this.logger.error(`Error: Failed to retrieve the remote size of target "${target.source}": ${this.proc.err.trim()}`);
		// 	return null;
		// }
		// const bytes = parseInt(this.proc.out);
		// if (isNaN(bytes)) {
		// 	this.logger.error(`Error: Failed to retrieve the remote size of target "${target.source}": Unable to parse number "${this.proc.out}".`);
		// 	return null;
		// }
		// this.logger.log(1, `Size of remote target "${target.name}" is ${bytes / 1024 / 1024 / 1024}GB.`);
		// return bytes;


		const args = [
			"-p", this.port,
			"-i", this.key,
			"-o", "StrictHostKeyChecking=no",
			`${this.user}@${this.ip}`,
			`"du -sk ${target.source} | awk '{print $1}'"`, // in KB.
		];
		// this.proc.debug = true;
		const exit_status = await this.proc.start({command: "ssh", args});
		// this.proc.debug = false;
		// console.log("EXIT STATUS", exit_status);
		if (exit_status != 0) {
			this.logger.error(`Error: Failed to retrieve the remote size of target "${target.source}" [${exit_status}]: ${this.proc.err}`);
			return null;
		}
		const bytes = parseInt(this.proc.out);
		if (isNaN(bytes)) {
			this.logger.error(`Error: Failed to retrieve the remote size of target "${target.source}": Unable to parse number "${this.proc.out}".`);
			return null;
		}
		this.logger.log(1, `Size of remote target "${target.name}" is ${(bytes / 1024 / 1024).toFixed(2)}GB.`);
		return bytes * 1024;
	}

	// Fetch the last version.
	async _fetch_last_version(target) {
		const paths = await target.destination.paths();
		let last_version = null;
		paths.iterate((path) => {
			const name = parseInt(path.name());
			if (!isNaN(name) && name > last_version) {
				last_version = name;
			}
		})
		if (last_version != null) {
			last_version = target.destination.join(last_version.toString());
		}
		return last_version;
	}

	// Fetch target versions.
	async _fetch_target_versions(target) {
		const versions = [];
		const paths = await target.destination.paths();
		paths.iterate(path => {
			const name = path.name();
			if (name !== ".sizes" && !isNaN(parseInt(name))) {
				versions.append(parseInt(name));
			}
		})
		versions.sort((a, b) => a - b);
		return versions;
	}

	// ---------------------------------------------------------
	// Synchronizing.

	// Scan.
	async _scan() {
		this.scan_timestamp = new vlib.Date();
		await this.targets.iterate_async_await((target) => this._synchronize(target));
		await vlib.utils.sleep(60 * 1000);
	}

	// Synchronize a target.
	async _synchronize(target) {
		try {

			// No sync required.
			if (target.next_update !== undefined && Date.now() <= target.next_update) {
				return ;
			}

			// Target must be a directory for this mode.
			if (!target.directory) {
				return await this._synchronize_full_copy(target);
			}

			// New version path.
			const timestamp = this.scan_timestamp[target.timestamp_start]().sec().toString();
			const new_version = target.destination.join(timestamp);

			// Retrieve the last version.
			const last_version = await this._fetch_last_version(target)
			if (last_version != null && last_version.name() === timestamp) {
				return ;
			}

			// Logs.
			this.logger.log(1, `Scanning target "${target.name}".`);

			// Free up space.
			await this._free_up_space(target);

			// Execute.
			const sync = async (dry_run = false) => {
				if (dry_run) {
					this.logger.log(1, `Synchronizing remote data of target "${target.name}@${timestamp}".`);
				}

				// Argumnents.
				const args = [];

				// Flags.
				args.append("-az");

				// Delete.
				if (target.delete) {
					args.append("--delete");
				}

				// Timeout.
				args.append("--timeout=600");

				// Exclude.
				target.exclude.iterate((i) => {
					args.append("--exclude", `"${i}"`);
				})

				// SSH.
				args.append("-e", `'ssh -p ${this.port} -i ${this.key}'`);

				// Link destination.
				if (last_version != null) {
					args.append(`--link-dest=../${last_version.name()}`);
				}

				// Dry run.
				if (dry_run) {
					args.appen("--dry-run", "--stats")
				}

				// Sparse: Reducing disk space usage on the destination by recreating sparse files correctly.
				args.append('--sparse');

				// Source and dest.
				args.append(`${this.user}@${this.ip}:${target.source}`);
				args.append(new_version.str() + "/");

				// Execute.
				const attempts = 3;
				for (let attempt = 0; attempt < attempts; attempt++) {
					const exit_status = await this.proc.start({
						command: this.rsync_bin,
						args,
					});

					// Success.
					if (exit_status === 0) {
						return true;
					}

					// Retry: exit status 10 is also thrown on a connection error.
					else if (attempt + 1 < attempts && exit_status === 10) {
						this.logger.log(0, `Connection error while synchronizing "${target.name}@${timestamp}", retrying.`);
						continue;
					}

					// Retry: broken pipe.
					else if (attempt + 1 < attempts && (this.proc.err != null && this.proc.err.includes("send disconnect: Broken pipe"))) {
						this.logger.log(0, `Broken pipe while synchronizing "${target.name}@${timestamp}", retrying.`);
						continue;
					}

					// Stop.
					else if (exit_status != 0) {
						this.logger.error(`Error: Failed to push target "${target.source}" [${exit_status}]: \n    > ${this.proc.err.trim().split("\n").join("\n    > ").slice(0, -7)}`);
						if (
							exit_status === 13 || // permission denied
							exit_status === 23
						) {
							this.logger.error("Consider adding these files to the exclude list in order to create a backup of this target.");
						}
						return false;
					}
				}
				return false;
			}

			// Dry run.
			// let res = await sync(true);
			// if (!res) { return ; }
			// else {
			// 	console.log("OUT:", this.proc.out);
			// 	process.exit(1);
			// }

			// Real run.
			const res = await sync();
			if (!res) { return ; }

			// Set as synchronized.
			target.next_update = Date.now() + target.update_ms;
			this.logger.log(0, `Synchronized "${target.name}@${timestamp}".`);

		}

		// Catch error.
		catch (error) {
			this.logger.error(`Error: Failed to push target "${target.name}": ${error.stack}`);
			if (error instanceof vbackup.FullDiskError) {
				throw error;
			}
			return ;
		}
	}

	// Free up space.
	async _free_up_space(target) {

		// Retrieve bytes.
		let remote_bytes = await this._fetch_remote_size(target);
		if (remote_bytes == null) {
			this.logger.error(`Error: Failed to retriev the remote size of target "${target.name}".`);
			return ;
		}

		// Get available.
		const available = await this.destination.available_space();

		// Throw error when free up space is disabled.
		if (!this.auto_remove && remote_bytes > available) {
			throw new vbackup.FullDiskError(`Disk is full.`);
		}

		// Check free up.
		if (remote_bytes > available) {

			// Create a map of versions mapped by timestamp.
			let versions = {};
			await this.targets.iterate_async_await(async (target) => {
				const target_versions = await this._fetch_target_versions(target);
				target_versions.iterate(timestamp => {
					const name = timestamp.toString()
					if (versions[name] == null) {
						versions[name] = [];
					}
					versions[name].append({
						target,
						timestamp,
						path: target.destination.join(version.toString()),
					})
				})
			});

			// Sort by timestamps.
			const timestamps = Object.keys(versions).sort((a, b) => parseInt(a) - parseInt(b));

			// Iterate timestamps and remove oldest ones.
			for (let t = 0; t < timestamps.length; t++) {
				const timestamp = timestamps[t];
				const version_items = versions[timestamp];
				for (let i = 0; i < version_items.length; t++) {
					const items = version_items[i];

					// Remove.
					this.logger.log(1, `Removing backup ${target.name}@${timestamp} to free up space.`);
					await item.path.del({recursive: true});

					// Check size again.
					const available = this.destination.available_space();
					if (remote_bytes > available) {
						return ;
					}
				}
			}

			// Check size again.
			const available = this.destination.available_space();
			if (remote_bytes > available) {
				throw new vbackup.FullDiskError(`Disk is full.`);
			}
		}
		else {
			this.logger.log(1, `Not removing old backups, still ${(available / 1024 / 1024 / 1024).toFixed(2)}GB available free space.`);
		}

		// Success.
		return ;
	}
	
}



