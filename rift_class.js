var UsbAdapter = function() {
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

	var initRift = function() {
	  console.log("initRift()");

	  mKeepAliveIntervalId = setInterval(sendKeepAlive, KEEP_ALIVE_INTERVAL);
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
		
	};

	var getPermissionObject = function() {
		return mPermissionObj;
	};

	return {
		"connect": connect,
		"disconnect": disconnect,
		"getPermissionObject": getPermissionObject
	};

};



//////////////////////////////////////

var usb = new UsbAdapter();
var requestButton = document.getElementById("requestPermission");

requestButton.addEventListener('click', function() {
  chrome.permissions.request( usb.getPermissionObject(), function(result) {
    if (result) {
    	console.log("got permission");
      usb.connect();
    } else {
      console.log('App was not granted the "usbDevices" permission.');
      console.log(chrome.runtime.lastError);
    }
  });
});

//////////////////////////////////////










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

