// Web Worker

var KEEP_ALIVE_INTERVAL = 10000;

var mIsLoopRunning = false;

var mKeepAliveIntervalId;

self.addEventListener('message', function(e) {
	var data = e.data;
	switch (data.cmd) {
		case 'start':
			self.postMessage('WORKER STARTED: ' + data.msg);
			mIsLoopRunning = true;

			mKeepAliveIntervalId = setInterval()

			break;
		case 'stop':
			self.postMessage('WORKER STOPPED: ' + data.msg);
			mIsLoopRunning = false;
			self.close();	// Terminates worker
			break;
		default:
			self.postMessage('Unknown command: ' + data.msg);

	}
}, false);

//----------------------------------------

