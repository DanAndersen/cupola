/*
var cupola = new Cupola({
	onConnect : function() {
		console.log("Rift is connected");
	},
	onDisconnect : function() {
		console.log("Rift is disconnected");
	},
	onConfigUpdate : function(config) {
		console.log("Received new config", config);
		console.log("Field of view: " + config.FOV);
	}
	onOrientationUpdate : function(quatValues) {
		var values = [quatValues.x, quatValues.y, quatValues.z, quatValues.w];
        console.log("Orientation: " + values.join(", "));
	},
	debug: false,
	timeout: 2000
});
cupola.connect();
cupola.isConnected();
cupola.getOrientation();
cupola.getConfiguration();
cupola.disconnect();
*/

var Cupola = function(config) {
	config = config? config : {};

	var mCurrentOrientation = {x: 0, y: 0, z: 0, w: 1};

	var mCurrentConfiguration = {
    FOV											: 125.871,
    hScreenSize							: 0.14976,
    vScreenSize							: 0.0935,
    vScreenCenter						: 0.0935 / 2,
    eyeToScreenDistance			: 0.041,
    lensSeparationDistance	: 0.067,
    interpupillaryDistance	: 0.0675,
    hResolution							: 1280,
    vResolution							: 720,
    distortionK							: [1, .22, .24, 0],
    chromaAbParameter				: [0.996, -0.004, 1.014, 0],
    gender									: "Unspecified",
    playerHeight						: 1.778
  };

	var mIsConnected = false;	// true if the app wants to process incoming messages

	var mDebugEnabled = config.hasOwnProperty("debug") ? config["debug"] : false;

	var mTimeoutId;

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

	var debug = function(msg) {
		if (mDebugEnabled) {
			console.log("Cupola client: " + msg);
		}
	};

	var connect = function() {
		debug("connect()");
		if (!mIsConnected) {
			mIsConnected = true;

			if (callbacks["onConnect"]) {
				debug("invoking onConnect callback");
				callbacks["onConnect"]();
			}
		}
	};

	var disconnect = function() {
		debug("disconnect()");
		if (mIsConnected) {
			mIsConnected = false;

			if (callbacks["onDisconnect"]) {
				debug("invoking onDisconnect callback");
				callbacks["onDisconnect"]();
			}
		}
	};

	var isConnected = function() {
		debug("isConnected()");
		return mIsConnected;
	};

	var getOrientation = function() {
		debug("getOrientation()");
		return mCurrentOrientation;
	};

	var getConfiguration = function() {
		debug("getConfiguration()");
		return mCurrentConfiguration;
	};

	var updateOrientation = function(quat) {
		if (quat && typeof quat === 'object') {
			for (var key in quat) {
				mCurrentOrientation[key] = quat[key];
			}

			if (callbacks["onOrientationUpdate"]) {
				debug("invoking onOrientationUpdate callback");
				callbacks["onOrientationUpdate"](mCurrentOrientation);
			}
		}
	};

	var updateConfig = function(config) {
		if (quat && typeof quat === 'object') {
			for (var key in config) {
				mCurrentConfiguration[key] = config[key];
			}

			if (callbacks["onConfigUpdate"]) {
				debug("invoking onConfigUpdate callback");
				callbacks["onConfigUpdate"](mCurrentConfiguration);
			}
		}
	};

	// set up message listener to accept incoming messages 
	window.addEventListener('message', function(e) {
		if (mIsConnected) {
			debug("received message");
		  var receivedMessage = e.data;

		  if (receivedMessage && typeof receivedMessage === 'object') {
		    var msgVersion = receivedMessage["version"];
		    var msgType = receivedMessage["msg"];
		    var msgData = receivedMessage["data"];

		    switch (msgType) {
		      case 'quat':
		      	debug("received new orientation data");
		      	updateOrientation(msgData);
		        break;
		      case 'config':
		        debug("got config from viewer");
		        updateConfig(msgData);
		        break;
		      default:
		        debug("unrecognized message from Cupola viewer: " + JSON.stringify(receivedMessage));
		        break;
		    }
		  }
		}
	});

	return {
		"isConnected"				: isConnected,
		"disconnect"				: disconnect,
		"connect"						:	connect,
		"getOrientation"		: getOrientation,
		"getConfiguration"	: getConfiguration
	};
};