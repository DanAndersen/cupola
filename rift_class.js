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

	var mRunning = false;

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

	var mPollSensorsTransferInfo = {
    "direction": "in",
    "endpoint" : 1,
    "length": 64
  };  // 62 is length of a single orientation block

	var pollRiftSensors = function() {
		//console.log("pollRiftSensors()");
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
		
	};

	var getPermissionObject = function() {
		return mPermissionObj;
	};

	return {
		"connect": connect,
		"disconnect": disconnect,
		"getPermissionObject": getPermissionObject,
		"pollRiftSensors": pollRiftSensors
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



var connectButton = document.getElementById("connect");
connectButton.addEventListener('click', function() {
	usb.connect();
});

var disconnectButton = document.getElementById("disconnect");
disconnectButton.addEventListener('click', function() {
	usb.disconnect();
});



var statDiv = document.getElementById("stats");

function updateQuatLabel(quat) {
	statDiv.innerText = JSON.stringify(quat);
}

//====================================================================
// putting worker computation back into normal thread













var TrackerMessage = function() {

	var SENSOR_SCALE = 0.0001;
	var TEMPERATURE_SCALE = 0.01;

	var mSampleCount;
	var mTimestamp;
	var mLastCommandId;

	var samples = [];	// Vector3 for mAcc, mGyro
	var mMag = new THREE.Vector3();	// Vector3

	var parseBuffer = function(buffer) {
		log("parseBuffer()");

		if (buffer.length == 62) {
			log("correct length: " + buffer.length);

			mSampleCount = buffer[1];
			mTimestamp = decodeUInt16(buffer, 2);
			mLastCommandId = decodeUInt16(buffer, 4);
			mTemperature = decodeSInt16(buffer, 6) * TEMPERATURE_SCALE;

			var iterationCount = Math.min(3, mSampleCount);
			for (var i = 0; i < iterationCount; i++) {
				samples[i] = {
					mAcc: unpackSensor(buffer, 8 + 16 * i).multiplyScalar(SENSOR_SCALE),
					mGyro: unpackSensor(buffer, 16 + 16 * i).multiplyScalar(SENSOR_SCALE)
				};
			}

			mMag.set(
				decodeSInt16(buffer, 56),
				decodeSInt16(buffer, 58),
				decodeSInt16(buffer, 60)
			).multiplyScalar(SENSOR_SCALE);

			return true;
		} else {
			log("wrong length: " + buffer.length);
			return false;
		}
	};

	var decodeUInt16 = function(buffer, start) {
		return (buffer[start+1] << 8 | buffer[start]) & 0xffff;
	};

	var decodeSInt16 = function(buffer, start) {
		return (buffer[start+1] << 8 | buffer[start]);
	};

	var unpackSensor = function(buffer, start) {
		return new THREE.Vector3(
			( buffer[start+0] << 24 | (buffer[start+1] & 0xff) << 16 | (buffer[start+2] & 0xff) << 8 ) >> 11,
      ( buffer[start+2] << 29 | (buffer[start+3] & 0xff) << 21 | (buffer[start+4] & 0xff) << 13 | (buffer[start+5] & 0xff) << 5 ) >> 11,
      ( buffer[start+5] << 26 | (buffer[start+6] & 0xff) << 18 | (buffer[start+7] & 0xff) << 10 ) >> 11
		);
	};

	var toString = function() {
		return "TS: " + mTimestamp + ", Temp: " + mTemperature + "C\n" +
			"Acc:\n" +
			"\t" + samples[0].mAcc.x + " m/s^2\n" + 
			"\t" + samples[0].mAcc.y + " m/s^2\n" +
			"\t" + samples[0].mAcc.z + " m/s^2\n" + 
			"Gyro:\n" +
			"\t" + samples[0].mGyro.x + " rad/s\n" + 
			"\t" + samples[0].mGyro.y + " rad/s\n" +
			"\t" + samples[0].mGyro.z + " rad/s\n" + 
			"Mag:\n" +
			"\t" + mMag.x + "\n" + 
			"\t" + mMag.y + "\n" +
			"\t" + mMag.z;
	};


	var getSampleCount = function() {
		return mSampleCount;
	};

	var getSamples = function() {
		return samples;
	};

	var getMag = function() {
		return mMag;
	};

	var getTemperature = function() {
		return mTemperature;
	};

	return {
		'parseBuffer': parseBuffer,
		'toString': toString,
		'getSampleCount': getSampleCount,
		'getSamples': getSamples,
		'getMag': getMag,
		'getTemperature': getTemperature
	};

};

//---------------------------------

var MessageBodyFrame = function() {
	var mAcceleration = new THREE.Vector3();
	var mRotationRate = new THREE.Vector3();
	var mMagneticField = new THREE.Vector3();
	var mTemperature;
	var mTimeDelta;

	var getTimeDelta = function() {
		return mTimeDelta;
	};

	var setTimeDelta = function(td) {
		mTimeDelta = td;
	};

	var getTemperature = function() {
		return mTemperature;
	};

	var setTemperature = function(t) {
		mTemperature = t;
	};

	var getAcceleration = function() {
		return mAcceleration;
	};

	var setAcceleration = function(a) {
		mAcceleration.copy(a);
	};

	var getRotationRate = function() {
		return mRotationRate;
	}

	var setRotationRate = function(rr) {
		mRotationRate.copy(rr);
	};

	var getMagneticField = function() {
		return mMagneticField;
	};

	var setMagneticField = function(mf) {
		mMagneticField.copy(mf);
	};

	return {
		'getAcceleration': getAcceleration,
		'setAcceleration': setAcceleration,
		'getRotationRate': getRotationRate,
		'setRotationRate': setRotationRate,
		'getMagneticField': getMagneticField,
		'setMagneticField': setMagneticField,
		'getTemperature': getTemperature,
		'setTemperature': setTemperature,
		'getTimeDelta': getTimeDelta,
		'setTimeDelta': setTimeDelta
	};
};


var RiftOrientation = function() {

	var timeUnit = 1.0 / 1000.0;
	var YAW_MULT = 1.0;
	var GAIN = 0.5;
	var ENABLE_GRAVITY = true;

	var mAngV = new THREE.Vector3();
	var mA = new THREE.Vector3();
	var mOrientation = new THREE.Quaternion();
	var mSensors = new MessageBodyFrame();

	var updateOrientationFromTrackerMessage = function(msg) {
		log("updateOrientationFromTrackerMessage()");
		var iterations = msg.getSampleCount();
		log("iterations: " + iterations);
		if (msg.getSampleCount() > 3) {
			iterations = 3;
			mSensors.setTimeDelta((msg.getSampleCount() - 2) * timeUnit);
		} else {
			mSensors.setTimeDelta(timeUnit);
		}
		log("sensor timedelta: " + mSensors.getTimeDelta());

		for (var i = 0; i < iterations; i++) {
			log("iteration #" + i);
			mSensors.setAcceleration(msg.getSamples()[i].mAcc);
			mSensors.setRotationRate(msg.getSamples()[i].mGyro);
			mSensors.setMagneticField(msg.getMag());
			mSensors.setTemperature(msg.getTemperature());
			log("\tacceleration: " + JSON.stringify(mSensors.getAcceleration()));
			log("\tRotationRate: " + JSON.stringify(mSensors.getRotationRate()));
			log("\tMagneticField: " + JSON.stringify(mSensors.getMagneticField()));
			log("\tTemperature: " + mSensors.getTemperature());

			updateOrientationFromMessageBodyFrame(mSensors);

			mSensors.setTimeDelta(timeUnit);
		}

	};

	var dQ = new THREE.Quaternion();
	var feedback = new THREE.Quaternion();
	var feedback2 = new THREE.Quaternion();
	var q1 = new THREE.Quaternion();
	var q2 = new THREE.Quaternion();
	var dV = new THREE.Vector3();
	var aw = new THREE.Vector3();
	var tempV = new THREE.Vector3();
	var yUp = new THREE.Vector3();

	var updateOrientationFromMessageBodyFrame = function(sensors) {
		log("updateOrientationFromMessageBodyFrame()");

		mAngV.copy(sensors.getRotationRate());
		log("mAngV before: " + JSON.stringify(mAngV));
		mAngV.y *= YAW_MULT;
		log("mAngV after: " + JSON.stringify(mAngV));

		mA.copy(sensors.getAcceleration()).multiplyScalar(sensors.getTimeDelta());

		dV.copy(mAngV).multiplyScalar(sensors.getTimeDelta());
		log("dV: " + JSON.stringify(dV));

		var angle = dV.length();
		log("angle: " + angle);

		if (angle > 0.0) {
			var halfa = angle * 0.5;
			var sina = Math.sin(halfa) / angle;
			dQ.set(
				dV.x * sina,
				dV.y * sina,
				dV.z * sina,
				Math.cos(halfa)
			);
			mOrientation.multiply(dQ);
		}

		var accelMagnitude = sensors.getAcceleration().length();
		var angVMagnitude = mAngV.length();
		var gravityEpsilon = 0.4;
		var angVEpsilon = 3.0;

		log("accelMagnitude: " + accelMagnitude);

		if (ENABLE_GRAVITY && 
			(Math.abs(accelMagnitude - 9.81) < gravityEpsilon) &&
			(angVMagnitude < angVEpsilon)) {

			yUp.set(0,1,0);
			aw = rotate(aw, mOrientation, mA);

			feedback.set(
				-aw.z * GAIN,
				0,
				aw.x * GAIN,
				1);

			q1.copy(feedback).multiply(mOrientation);
			q1.normalize();

			var angle0 = angleBetween(yUp, aw);
			log("angle0: " + angle0);

			tempV = rotate(tempV, q2, mA);
			var angle1 = angleBetween(yUp, tempV);
			log("angle1: " + angle1);

			if(angle1 < angle0) {
				mOrientation.copy(q1);
			} else {

				feedback2.set(
					aw.z * GAIN,
					0,
					-aw.x * GAIN,
					1);

				q2.copy(feedback2).multiply(mOrientation);
				q2.normalize();

				tempV = rotate(tempV, q2, mA);
				var angle2 = angleBetween(yUp, tempV);
				log("angle2: " + angle2);
				if (angle2 < angle0) {
					mOrientation.copy(q2);
				}

			}
		}
		log("finished updating orientation");
		log("mOrientation: " + JSON.stringify(mOrientation));
	};

	var tempQ = new THREE.Quaternion();
	var invQ = new THREE.Quaternion();

	var rotate = function(result, q, v) {
		log("rotate()");
		tempQ.copy(q);
		invQ.copy(q).inverse();

		tempQ.multiply(v.x, v.y, v.z, 1);
		//tempQ.multiplyVector3(v, tempQ);
		tempQ.multiply(invQ);

		result.copy(tempQ.x, tempQ.y, tempQ.z);
		return result;
	};

	var angleBetween = function(v1, v2) {
		return Math.acos( v1.dot(v2) / ((v1.length())*(v2.length())) );
	};

	var getOrientation = function() {
		return mOrientation;
	};

	return {
		"updateOrientation": updateOrientationFromTrackerMessage,
		"getOrientation": getOrientation
	};
};

var mTrackerMessage = new TrackerMessage();
var mRiftOrientation = new RiftOrientation();

function process(buf) {
	log("process()");
	var buffer = new Uint8Array(buf);
	if (mTrackerMessage.parseBuffer(buffer)) {
		log("message successfully parsed");

		log(mTrackerMessage.toString());

		log("updating orientation");
		mRiftOrientation.updateOrientation(mTrackerMessage);

		updateQuatLabel(mRiftOrientation.getOrientation());

		sendOrientationToSimulation(mRiftOrientation.getOrientation());

		usb.pollRiftSensors();
	} else {
		log("message failed parsing");
	}
}








function log(logMessage) {
	//console.log(logMessage);
}


//====================================================================



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











var webview = document.getElementById("simWebview");

var sendOrientationToSimulation = function(quat) {
	console.log("sending quat");
	webview.contentWindow.postMessage({x: quat._x, y: quat._y, z: quat._z, w: quat._w}, '*');
}