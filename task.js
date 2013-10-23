// Web Worker

self.addEventListener('message', function(e) {
	self.postMessage("worker received: [" + e.data + "]");
});