var UsbAdapter = function() {
	
	var mPredictDt = 0.045;	// default is 0.03 seconds -- says how far to look-ahead when getting orientation
													// higher values can offset lag, but can also lead to jerky acceleration/deceleration

	var mDebugEnabled = false;

	if (!chrome.permissions) {
		console.error("UsbAdapter: Requires chrome.permissions API");
		return null;
	}
	if (!chrome.usb) {
		console.error("UsbAdapter: Requires chrome.usb API");
		return null;
	}

	var RIFT_VENDOR_ID = 10291;
	var RIFT_PRODUCT_ID = 1;
	var DEVICE_INFO = {"vendorId": RIFT_VENDOR_ID, "productId": RIFT_PRODUCT_ID};

	var KEEP_ALIVE_INTERVAL = 10000;

	var mPermissionObj = {permissions: [{'usbDevices': [DEVICE_INFO] }]};
	var mHasPermission = false;

	var mRiftConnectionHandle;

	var mKeepAliveIntervalId;

	var mConnected = true;

	var mRunning = false;

	var mTrackerMessage;
	var mSensorFusion;
	resetSensors();

	function resetSensors() {
		mTrackerMessage = new TrackerMessage();
		mSensorFusion = new SensorFusion();
	}


	//-----------------------------

	function onWorkerError(e) {
		console.log('WORKER ERROR: line ' + e.lineno + ' in ' + e.filename + ': ' + e.message);
	}

	function onWorkerMessage(e) {
		var data = e.data;

		switch (data.cmd) {
			case 'log':
				console.log('Worker said: [' + data.msg + ']');
				break;
			case 'quat':
				console.log('Received a quat from worker: ' + JSON.stringify(data));

				updateQuatLabel(data);

				if (mRunning) {
					setTimeout(pollRiftSensors, 0);
					//mRunning = false;
				}

				break;
			default:
				console.error('Unknown command: ' + data.msg);
		}
	}

	//-----------------------------

	// http://www.usb.org/developers/devclass_docs/HID1_11.pdf from page 51
  // 0x21   => Send direction
  // 0x09   => Set_Report request
  // 0x0308 => Report Type Feature 0x03 << 8 | Report ID 0x08 (keep alive)
  var mKeepAliveCommand = 0;
	var mKeepAliveTransferInfo = {
    "requestType": "class",
    "recipient": "device",
    "direction": "out",
    "request": 0x09,
    "value": 0x0308,
    "index": 0,
    "data": new Uint8Array([
        8,
        mKeepAliveCommand & 0xFF,
        mKeepAliveCommand >> 8,
        KEEP_ALIVE_INTERVAL & 0xFF,
        KEEP_ALIVE_INTERVAL >> 8
      ]).buffer
  };

	//-----------------------------

	var sendKeepAliveCompleted = function(usbEvent) {
		if (chrome.runtime.lastError) {
	    console.error("sendKeepAliveCompleted Error:", chrome.runtime.lastError);
	  }

	  if (usbEvent) {
	    if (usbEvent.data) {
	      buf = new Uint8Array(usbEvent.data);
	      console.log("sendKeepAliveCompleted Buffer:", usbEvent.data.byteLength, buf);

	      if (!mConnected) {
	        console.log("not already connected; connecting");
	        mConnected = true;
	      }
	    }
	    if (usbEvent.resultCode !== 0) {
	      console.error("Error writing to device", usbEvent.resultCode);
	    }
	  }
	};

	var sendKeepAlive = function() {
		console.log("sendKeepAlive()");
		chrome.usb.controlTransfer(mRiftConnectionHandle, mKeepAliveTransferInfo, sendKeepAliveCompleted);
	};

	//-----------------

	var process = function(buf) {
		debug("process()");
		var buffer = new Uint8Array(buf);
		if (mTrackerMessage.parseBuffer(buffer)) {
			debug("message successfully parsed");

			debug(mTrackerMessage.toString());

			debug("updating orientation");
			mSensorFusion.updateOrientationFromTrackerMessage(mTrackerMessage);

			var orientation = mSensorFusion.getPredictedOrientation(mPredictDt);
			debug("orientation: " + JSON.stringify(orientation));

			// NOTE: updating the DOM like this really slows things down
			//updateQuatLabel(orientation);

			sendOrientationToSimulation(orientation);

			if (mRunning) {
				pollRiftSensors();
			}
		} else {
			log("message failed parsing");
		}
	};

	var mPollSensorsTransferInfo = {
    "direction": "in",
    "endpoint" : 1,
    "length": 64
  };  // 62 is length of a single orientation block

	var pollRiftSensors = function() {
		debug("pollRiftSensors()");
		chrome.usb.bulkTransfer(mRiftConnectionHandle, mPollSensorsTransferInfo, sensorDataReceived);
	};


	var sensorDataReceived = function(usbEvent) {
		//console.log("sensorDataReceived()");
	  //console.log("usbEvent", usbEvent);

	  if (chrome.runtime.lastError) {
	    console.error("sensorDataReceived Error:", chrome.runtime.lastError);
	  }

	  if (usbEvent) {
	    if (usbEvent.data) {
	      //console.log("sensorDataReceived Buffer:", usbEvent.data.byteLength);   

	      process(usbEvent.data);
	    }
	    if (usbEvent.resultCode !== 0) {
	      console.error("Error receiving from device", usbEvent.resultCode);
	    }
	  }
	};

	var debug = function(debugMessage) {
		if (mDebugEnabled) {
			console.log("rift_class (DEBUG): " + debugMessage);
		}
	}

	var log = function(logMessage) {
		console.log(logMessage);
	};


	//-------------------

	var initRift = function() {
	  console.log("initRift()");

	  if (!mRunning) {
	  	mRunning = true;

	  	// send first keep-alive to start up the connection
	  	sendKeepAlive();

	  	// start up interval task to send keep-alive message
	  	mKeepAliveIntervalId = setInterval(sendKeepAlive, KEEP_ALIVE_INTERVAL);

	  	// start receiving data from rift
	  	pollRiftSensors();
	  }
	};

	var gotPermission = function() {
		console.log("App was granted the 'usbDevices' permission.");
		mHasPermission = true;

		chrome.usb.findDevices( DEVICE_INFO,
      function(devices) {
        if (!devices || !devices.length) {
          console.log('device not found');
          return;
        }
        console.log('Found device: ' + devices[0].handle);
        mRiftConnectionHandle = devices[0];

        initRift();
    });
	};

	var connect = function() {
		console.log("connect()");
		
		chrome.permissions.contains( mPermissionObj, function(result) {
		  if (result) {
		    gotPermission();
		  }
		});
	};

	var disconnect = function() {
		console.log("disconnect()");

		if (mKeepAliveIntervalId) {
			console.log("stopping keep-alive action");
			clearInterval(mKeepAliveIntervalId);	
		}
		
		mRunning = false;

		resetSensors();
		
	};

	var getPermissionObject = function() {
		return mPermissionObj;
	};

	return {
		"connect": connect,
		"disconnect": disconnect,
		"getPermissionObject": getPermissionObject,
		"pollRiftSensors": pollRiftSensors,
		"mPredictDt": mPredictDt
	};

};



//////////////////////////////////////

var usb = new UsbAdapter();
var requestButton = document.getElementById("requestPermission");

function viewerConnect() {
	console.log("connect button pressed");
	chrome.permissions.request( usb.getPermissionObject(), function(result) {
    if (result) {
    	console.log("got permission");
      usb.connect();
    } else {
      console.log('App was not granted the "usbDevices" permission.');
      console.log(chrome.runtime.lastError);
    }
  });
}


function viewerDisconnect() {
	console.log("disconnect button pressed");
	usb.disconnect();
}




var connectButton = document.getElementById("connect");
connectButton.addEventListener('click', viewerConnect);

var disconnectButton = document.getElementById("disconnect");
disconnectButton.addEventListener('click', viewerDisconnect);

var statDiv = document.getElementById("stats");

function updateQuatLabel(quat) {
	statDiv.innerText = JSON.stringify(quat);
}

var webview = document.getElementById("sim-webview");

var sendOrientationToSimulation = function(quat) {
	webview.contentWindow.postMessage({x: quat._x, y: quat._y, z: quat._z, w: quat._w}, '*');
}


//----------------------------

// GUI

var gui = new dat.GUI();

var actionGuiFolder = gui.addFolder('Actions');

var actionObj = {
	connect: viewerConnect,
	disconnect: viewerDisconnect
};

actionGuiFolder.add(actionObj, 'connect').name("Connect to Rift");
actionGuiFolder.add(actionObj, 'disconnect').name("Disconnect from Rift");
actionGuiFolder.open();

var configGuiFolder = gui.addFolder('Config');

configGuiFolder.add(usb, 'mPredictDt', 0, 0.1).name("Orientation prediction (sec)");