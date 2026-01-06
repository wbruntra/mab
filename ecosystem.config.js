module.exports = {
  "apps": [
    {
      "name": "mab-api-server",
      "script": "api-server.js",
      "cwd": "/home/william/personal/mab",
            "interpreter": "bun",
      "exec_mode": "fork",

      "instances": 1,
      "autorestart": true,
      "stop_exit_codes": [0],
      "watch": false,
      "max_memory_restart": "1G",
      "env": {
        "NODE_ENV": "development",
        "PORT": 8404
      },
      "log_file": "/home/william/personal/mab/logs/api-server-combined.log",
      "out_file": "/home/william/personal/mab/logs/api-server-out.log",
      "error_file": "/home/william/personal/mab/logs/api-server-error.log",
      "merge_logs": true,
      "time": true
    },
    // {
    //   "name": "mab-transcriber",
    //   "script": "background-transcriber.js",
    //   "cwd": "/home/william/personal/mab",
    //   "interpreter": "bun",
    //   "exec_mode": "fork",
    //   "instances": 1,
    //   "autorestart": true,
    //   "watch": false,
    //   "max_memory_restart": "1G",
    //   "env": {
    //     "NODE_ENV": "development"
    //   },
    //   "log_file": "/home/william/personal/mab/logs/transcriber-combined.log",
    //   "out_file": "/home/william/personal/mab/logs/transcriber-out.log",
    //   "error_file": "/home/william/personal/mab/logs/transcriber-error.log",
    //   "merge_logs": true,
    //   "time": true
    // },
    // {
    //   "name": "mab-summarizer",
    //   "script": "background-summarizer.js",
    //   "cwd": "/home/william/personal/mab",
    //   "instances": 1,
    //   "autorestart": true,
    //   "watch": false,
    //   "max_memory_restart": "1G",
    //   "env": {
    //     "NODE_ENV": "development"
    //   },
    //   "log_file": "/home/william/personal/mab/logs/summarizer-combined.log",
    //   "out_file": "/home/william/personal/mab/logs/summarizer-out.log",
    //   "error_file": "/home/william/personal/mab/logs/summarizer-error.log",
    //   "merge_logs": true,
    //   "time": true
    // }
  ]
}
