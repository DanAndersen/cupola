

var RiftUsb = function(config) {
	config = config ? config : {};

	var mRetryOnDisconnect = true;

	var mDebugEnabled = config.hasOwnProperty("debug") ? config["debug"] : true;

	var callbacks = {
		onOrientationUpdate: null,
		onConfigUpdate: null,
		onConnect: null,
		onDisconnect: null
	};

	// hook up callbacks specified in config
	for (var cb in callbacks) {
		if (typeof(config[cb]) == "function") {
			callbacks[cb] = config[cb];
		}
	}

	var error = function(message) {
		console.error("RiftUsb: " + message);
	}

	var debug = function(message) {
		if (mDebugEnabled) {
			console.log("RiftUsb: " + message);
		}
	}


	//---------------------

	var isConnected = function() {
		debug("isConnected()");
		error("isConnected() not implemented yet");
	}

	var disconnect = function() {
		debug("disconnect()");
		error("disconnect() not implemented yet");
	}

	var connect = function() {
		debug("connect()");
		error("connect() not implemented yet");

		mRetryOnDisconnect = true;

	}

	var getOrientation = function() {
		debug("getOrientation()");
		error("getOrientation() not implemented yet");
	}

	var getConfiguration = function() {
		debug("getConfiguration()");
		error("getConfiguration() not implemented yet");
	}

	return {
		"isConnected": isConnected,
		"disconnect": disconnect,
		"connect": connect,
		"getOrientation": getOrientation,
		"getConfiguration": getConfiguration
	}
};

//------------------------

var myRiftUsb = new RiftUsb({
	"onOrientationUpdate": onOrientationUpdate,
	"onConfigUpdate": onConfigUpdate,
	"onConnect": onConnect,
	"onDisconnect": onDisconnect
});

var onOrientationUpdate = function(quat) {
	console.log("onOrientationUpdate", quat);
}

var onConfigUpdate = function(config) {
	console.log("onConfigUpdate", config);
}

var onConnect = function() {
	console.log("onConnect");
}

var onDisconnect = function() {
	console.log("onDisconnect");
}

//========================================================



