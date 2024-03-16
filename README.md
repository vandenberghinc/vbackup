# VBackup
Create a backup-server with ease. The backup server acts as a ssh client to the main server. There, for security purposes, the main server is not required to have access to backup server.

More information can be found in the [documentation](https://vandenberghinc.github.io/vbackup).

## Creating a backup server.
Create a configuration file.
```js
{
    "name": "my-backup-server",         // The name of your local server for the service daemon.
    "ip": "0.0.0.0",                    // The remote ip.
    "port": 22,                         // The ssh port.
    "user": "my-user",                  // The remote user.
    "key": "/path/to/private/ssh/key",  // The path to the private ssh key.
    "destination": "/backups/",         // The directory where all files will be backed up.
    "targets": [
        {
            "source": "/path/to/dir/",  // The target path on the remote server.
            "interval": "day",          // The backup interval, minute, hour, day, week, month or year.
            "frequency": 1,             // The backup interval frequency.
            "exclude": [],              // Excluded sub paths.
            "delete": false             // Remove the deleted files (true is advised).
        }
    ],
    "log_level": 0,                     // The active log level.
    "log_path": null,                   // The log path for the service daemon.
    "error_path": null                  // The error path for the service daemon.
}
```

Start the server.
```sh
vbackup --start --config /path/to/my/config.json
```

Start the server's service daemon.
```sh
vbackup --start --daemon --config /path/to/my/config.json
```

Stop the server's service daemon.
```sh
vbackup --stop --config /path/to/my/config.json
```

Restart the server's service daemon.
```sh
vbackup --restart --config /path/to/my/config.json
```