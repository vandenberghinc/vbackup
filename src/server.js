/*
 * Author: Daan van den Bergh
 * Copyright: © 2022 - 2023 Daan van den Bergh.
 */

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
			@default: false
		@attr:
			@name: directory
			@descr: The target and source paths are directories.
			@type: boolean
			@default: true
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
		name,
		ip,
		port = 22,
		user,
		key,
		destination,		
		targets,
		target_source_may_exist = false,
		log_level = 1,
		log_path = null,
		error_path = null,
		_config_path = null,
	}) {
		
		// Verify args.
        vlib.utils.verify_params({params: arguments[0], check_unknown: true, info: {
        	name: "string",
            ip: "string",
            port: {type: "number", default: 22},
            user: "string",
            key: "string",
            destination: "string",
            targets: "array",
            target_source_may_exist: {type: "boolean", default: false},
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
        			target.delete = false;
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
	            user: libos.userInfo().username,
	            group: null,
	            command: "vbackup",
	            args: ["--start", "--config", _config_path.toString()],
	            env: {},
	            description: `Service daemon for backup server ${name}.`,
	            auto_restart: true,
	            logs: log_path instanceof vlib.Path ? log_path.str() : log_path,
	            errors: error_path instanceof vlib.Path ? error_path.str() : error_path,
	        })
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

			// Logs.
			this.logger.log(1, `Scanning target "${target.name}".`);

			// New version path.
			const timestamp = this.scan_timestamp[target.timestamp_start]().sec().toString();
			const new_version = target.destination.join(timestamp);

			// Copy the newest backup to the new location to avoid much network usage and main server cpu usage.
			const paths = await target.destination.paths();
			let last_version = null;
			paths.iterate((path) => {
				const name = parseInt(path.name());
				if (!isNaN(name) && last_version == null || name > last_version) {
					last_version = name;
				}
			})
			if (last_version != null && last_version.toString() != timestamp) {
				last_version = target.destination.join(last_version.toString());

				// Free up space based on max of local and remote.
				if (!await this._free_up_space(target, last_version.size)) {
					this.logger.error(`Error: Skipping backup of target "${target.source}".`);
					return ;
				}

				// Copy to new location.
				last_version.cp_sync(new_version);

			}

			// Free up space based on remote only.
			else if (!await this._free_up_space(target)) {
				this.logger.error(`Error: Skipping backup of target "${target.source}".`);
				return ;
			}

			// Argumnents.
			const args = [];

			// Directory.
			if (target.directory) {
				args.append("-az");
			}

			// SSH, source & dest.
			args.append("-e", `'ssh -p ${this.port} -i ${this.key}'`);
			args.append(`${this.user}@${this.ip}:${target.source}`);
			args.append(new_version.str() + "/");

			// Delete.
			if (target.delete) {
				args.append("--delete");
			}

			// Exclude.
			target.exclude.iterate((i) => {
				args.append("--exclude");
				args.append(i);
			})

			// Execute.
			this.logger.log(1, `Synchronizing remote data of target "${target.name}".`);
			const exit_status = await this.proc.start({
				command: "rsync",
				args,
			});

			// Process.
			if (exit_status != 0) {
				this.logger.error(`Error: Failed to push target "${target.source}": \n    > ${this.proc.err.trim().split("\n").join("\n    > ").slice(0, -7)}`);
				return ;
			}

			// Set as synchronized.
			target.next_update = Date.now() + target.update_ms;
			this.logger.log(0, `Synchronized "${target.name}/${timestamp}".`);

		}

		// Catch error.
		catch (error) {
			this.logger.error(`Error: Failed to push target "${target.source}": ${error.stack}`);
			return ;
		}
	}

	// Retrieve size of a target.
	async _retrieve_remote_size(target) {
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
			`du -sk ${target.source} | awk '{print $1}'`, // in KB.
		];
		const exit_status = await this.proc.start({command: "ssh", args});
		if (exit_status != 0) {
			this.logger.error(`Error: Failed to retrieve the remote size of target "${target.source}": ${this.proc.err}`);
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

	// Free up space.
	async _free_up_space(target, local_bytes = null) {

		// Retrieve bytes.
		let remote_bytes = await this._retrieve_remote_size(target);
		if (remote_bytes == null) {
			return false;
		}
		if (local_bytes != null) {
			remote_bytes = Math.max(local_bytes, remote_bytes);
		}

		// Check free up.
		const available = await this.destination.available_space();
		if (remote_bytes > available) {

			// Create a map of versions mapped by timestamp.
			let versions = {};
			await this.targets.iterate_async_await(async (target) => {

				// Retrieve the ".sizes file".
				const sizes_path = target.destination.join(".sizes");
				let sizes = {};
				if (sizes_path.exists()) {
					sizes = JSON.parse(sizes_path.load_sync());
				}

				// Retrive the size of all paths when not already cached.
				const retrieve_sizes = [];
				const paths = await target.destination.paths();
				paths.iterate((path) => {
					const name = path.name();
					if (name !== ".sizes" && sizes[name] == null && !isNaN(parseInt(name))) {
						retrieve_sizes.append(path.str());
					}
				})

				// Use "du" to retrieve the actual disk use size since nodejs uses the file size.
				if (retrieve_sizes.length > 0) {
					const exit_status = await this.proc.start({
						command: "du",
						args: ["-sk", ...retrieve_sizes],
					});
					if (exit_status != 0) {
						this.logger.error(`Error: Failed to retrieve the sizes of target "${target.source}": ${this.proc.err}`);
						return false;
					}
					this.proc.out.split("\n").iterate((line) => {
						const data = line.split("\t");
						const name = new vlib.Path(data[1]).name();
						const bytes = parseInt(data[0]);
						if (isNaN(bytes)) {
							this.logger.error(`Error: Failed to retrieve the local size of path "${data[1]}": Unable to parse number "${data[0]}".`);
						}
						sizes[name] = bytes * 1024; // convert to bytes.
					})
					sizes_path.save_sync(JSON.stringify(sizes));
				}
				console.log("sizes:", sizes)

				// Add to versions.
				Object.keys(sizes).iterate((name) => {
					versions[name].append({
						path: target.destination.join(name),
						target: target.name,
						timestamp: paresInt(name),
						size: sizes[name],
					});
				})
			});

			// Sort by timestamps.
			const timestamps = Object.keys(versions).sort((a, b) => parseInt(a) - parseInt(b));

			// Check what to remove till size is statisfied.
			let bytes_left = remote_bytes;
			let to_remove = [];
			timestamps.iterate((timestamp) => {
				return versions[timestamp].iterate((item) => {
					bytes_left -= item.size;
					to_remove.append(item);
					if (bytes_left <= 0) {
						return false;
					}
				})
			})

			// Check if it is possible to free up space.
			if (bytes_left > 0) {
				this.logger.error(`Error: Device is full, unable to free up space for the remote target.`);
				return false;
			}

			// Remove paths.
			to_remove.iterate((item) => {
				this.logger.log(1, `Removing old backup "${item.target}/${item.timestamp}" to free up space.`);
				item.path.del_sync({recursive: true})
			});

			// Check size again.
			const available = this.destination.available_space();
			if (remote_bytes > available) {
				this.logger.error(`Error: Failed to remove enough space.`);
				return false;
			}
		}
		else {
			this.logger.log(1, `Not removing old backups, still ${(available / 1024 / 1024 / 1024).toFixed(2)}GB available free space.`);
		}

		// Success.
		return true;
	}
}



